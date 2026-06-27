import "dotenv/config";

import { Worker, type ConnectionOptions } from "bullmq";
import { z } from "zod";
import { embed } from "@/lib/embeddings";
import { invalidateContributionStats } from "@/lib/contribution-cache";
import { invalidateUserFeedCaches } from "@/lib/feed-cache";
import { decryptGithubToken, getAppGitHubToken } from "@/lib/github-token";
import { groq, GROQ_MODEL } from "@/lib/groq";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { canonicalizeSkills, formatSkillEmbeddingText, skillIdentity } from "@/lib/skills";

const connection = redis as unknown as ConnectionOptions;

const contributionJobSchema = z.object({
  contributionId: z.string().min(1),
});

const diffFileSchema = z.object({
  filename: z.string(),
  additions: z.number().int(),
  deletions: z.number().int(),
  patch: z.string().optional(),
});

const contributionSummarySchema = z.object({
  aiDescription: z.string(),
  skillsDemonstrated: z.array(z.string()),
  complexity: z.number().int().min(1).max(5),
  linesAdded: z.number().int(),
  linesRemoved: z.number().int(),
  filesChanged: z.number().int(),
});

const systemPrompt =
  "You analyze merged GitHub PRs and extract contribution metadata. Return only strict JSON with keys: aiDescription (string), skillsDemonstrated (string array), complexity (integer 1-5), linesAdded (integer), linesRemoved (integer), filesChanged (integer). Use canonical skill display names when obvious, e.g. TypeScript, JavaScript, Node.js, Next.js, React, Tailwind CSS, tRPC, Prisma, Supabase, PostgreSQL, GraphQL, MongoDB, Redis, Docker, Kubernetes.";

function githubHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function getContributionGitHubToken(storedUserToken: string | null) {
  try {
    const userToken = decryptGithubToken(storedUserToken);
    if (userToken) return userToken;
  } catch (error) {
    console.warn("[contribution-summary] Could not decrypt user GitHub token", { error });
  }

  const token = getAppGitHubToken();
  if (!token) {
    throw new Error("No GitHub token available");
  }

  return token;
}

async function fetchPrFiles(repoOwner: string, repoName: string, prNumber: number, token: string) {
  const response = await fetch(
    `https://api.github.com/repos/${repoOwner}/${repoName}/pulls/${prNumber}/files`,
    { headers: githubHeaders(token) }
  );

  if (!response.ok) {
    throw new Error(`GitHub PR files fetch failed: ${response.status}`);
  }

  return z.array(diffFileSchema).parse(await response.json());
}

async function fetchPrBody(repoOwner: string, repoName: string, prNumber: number, token: string) {
  const response = await fetch(
    `https://api.github.com/repos/${repoOwner}/${repoName}/pulls/${prNumber}`,
    { headers: githubHeaders(token) }
  );

  if (!response.ok) {
    throw new Error(`GitHub PR fetch failed: ${response.status}`);
  }

  const payload = (await response.json()) as { body?: string | null };
  return payload.body ?? "";
}

function buildUserPrompt(contribution: {
  prTitle: string;
  repoOwner: string;
  repoName: string;
  prNumber: number;
}, prBody: string, diffFiles: Array<z.infer<typeof diffFileSchema>>) {
  return JSON.stringify({
    title: contribution.prTitle,
    description: prBody,
    files: diffFiles.map((file) => ({
      filename: file.filename,
      additions: file.additions,
      deletions: file.deletions,
      patch: (file.patch ?? "").slice(0, 500),
    })),
  });
}

function toVectorLiteral(values: number[]) {
  return `[${values.join(",")}]`;
}

export const contributionSummaryWorker = new Worker(
  "contribution-summary",
  async (job) => {
    const { contributionId } = contributionJobSchema.parse(job.data);
    const contribution = await prisma.contribution.findUnique({
      where: { id: contributionId },
      include: {
        user: {
          select: {
            id: true,
            githubToken: true,
            skillProfile: {
              select: {
                id: true,
                skills: {
                  select: {
                    id: true,
                    name: true,
                    level: true,
                    confidence: true,
                    repoCount: true,
                    commitCount: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!contribution) {
      throw new Error(`Contribution not found: ${contributionId}`);
    }

    const skillProfile = contribution.user.skillProfile;
    if (!skillProfile) {
      throw new Error(`User has no skill profile: ${contribution.userId}`);
    }

    const githubToken = getContributionGitHubToken(contribution.user.githubToken);
    const [diffFiles, prBody] = await Promise.all([
      fetchPrFiles(contribution.repoOwner, contribution.repoName, contribution.prNumber, githubToken),
      fetchPrBody(contribution.repoOwner, contribution.repoName, contribution.prNumber, githubToken),
    ]);

    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: buildUserPrompt(contribution, prBody, diffFiles) },
      ],
      temperature: 0.1,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error(`Groq returned an empty contribution summary for ${contributionId}`);
    }

    const summary = contributionSummarySchema.parse(JSON.parse(content));
    const demonstratedSkills = canonicalizeSkills(
      summary.skillsDemonstrated.map((name) => ({ name, level: "learning", confidence: 0.4 }))
    );
    const existingSkillNames = new Set(
      skillProfile.skills.map((skill) => skillIdentity(skill.name))
    );

    await prisma.$transaction(async (tx) => {
      await tx.contribution.update({
        where: { id: contribution.id },
        data: {
          aiDescription: summary.aiDescription,
          skillsDemonstrated: demonstratedSkills.map((skill) => skill.name),
          complexity: summary.complexity,
          linesAdded: summary.linesAdded,
          linesRemoved: summary.linesRemoved,
          filesChanged: summary.filesChanged,
          processed: true,
        },
      });

      for (const skill of demonstratedSkills) {
        if (existingSkillNames.has(skillIdentity(skill.name))) {
          continue;
        }

        await tx.skill.upsert({
          where: {
            skillProfileId_name: {
              skillProfileId: skillProfile.id,
              name: skill.name,
            },
          },
          update: {},
          create: {
            skillProfileId: skillProfile.id,
            name: skill.name,
            level: "learning",
            confidence: 0.4,
          },
        });

        existingSkillNames.add(skillIdentity(skill.name));
      }

      const allSkills = await tx.skill.findMany({
        where: { skillProfileId: skillProfile.id },
        orderBy: { name: "asc" },
        select: {
          name: true,
          level: true,
          confidence: true,
          repoCount: true,
          commitCount: true,
        },
      });

      const vector = toVectorLiteral(await embed(formatSkillEmbeddingText(allSkills)));

      await tx.$executeRaw`
        INSERT INTO skill_embeddings (skill_profile_id, embedding, updated_at)
        VALUES (${skillProfile.id}, ${vector}::vector, now())
        ON CONFLICT (skill_profile_id)
        DO UPDATE SET embedding = EXCLUDED.embedding, updated_at = now()
      `;

      await tx.skillSnapshot.create({
        data: {
          userId: contribution.userId,
          snapshot: allSkills,
        },
      });
    });

    await invalidateUserFeedCaches(contribution.userId, "contribution-summary");
    await invalidateContributionStats(contribution.userId);

    return { contributionId: contribution.id, processed: true };
  },
  { connection }
);
