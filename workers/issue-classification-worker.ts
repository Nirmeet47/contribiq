import "dotenv/config";

import { Worker, type ConnectionOptions } from "bullmq";
import { z } from "zod";
import { embed } from "@/lib/embeddings";
import { groq, GROQ_MODEL } from "@/lib/groq";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { matchScoringQueue } from "@/lib/queues";

const connection = redis as unknown as ConnectionOptions;

const classificationSchema = z.object({
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  estimatedHours: z.number().positive(),
  requiredSkills: z.array(z.string().min(1)).min(1),
  issueType: z.enum(["bug", "feature", "docs", "refactor"]),
  aiSummary: z.string().min(1),
});

const systemPrompt = `
You classify GitHub issues for open-source contributor matching.
Return only strict JSON. Do not include markdown, commentary, code fences, or extra keys.
The JSON object must contain:
- difficulty: one of "beginner", "intermediate", "advanced"
- estimatedHours: a number
- requiredSkills: an array of strings
- issueType: one of "bug", "feature", "docs", "refactor"
- aiSummary: a 2-3 sentence plain-English summary explaining what the issue is, what's broken or needed, and what kind of change would fix it
`;

function buildUserPrompt(issue: {
  title: string;
  body: string | null;
  labels: string[];
}) {
  return JSON.stringify({
    title: issue.title,
    body: issue.body ?? "",
    labels: issue.labels,
  });
}

function toVectorLiteral(values: number[]) {
  return `[${values.join(",")}]`;
}

export const issueClassificationWorker = new Worker(
  "issue-classification",
  async (job) => {
    const issueId = z.string().parse(job.data.issueId);
    const issue = await prisma.issue.findUnique({
      where: { id: issueId },
      select: { id: true, title: true, body: true, labels: true },
    });

    if (!issue) {
      throw new Error(`Issue not found: ${issueId}`);
    }

    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: buildUserPrompt(issue) },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error(`Groq returned an empty classification for ${issueId}`);
    }

    const classification = classificationSchema.parse(JSON.parse(content));
    const embedding = await embed(classification.requiredSkills.join(" "));
    const vector = toVectorLiteral(embedding);

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO issue_embeddings (issue_id, embedding, updated_at)
        VALUES (${issue.id}, ${vector}::vector, now())
        ON CONFLICT (issue_id)
        DO UPDATE SET embedding = EXCLUDED.embedding, updated_at = now()
      `;

      await tx.issue.update({
        where: { id: issue.id },
        data: {
          difficulty: classification.difficulty,
          estimatedHours: classification.estimatedHours,
          requiredSkills: classification.requiredSkills,
          issueType: classification.issueType,
          aiSummary: classification.aiSummary,
          classified: true,
        },
      });
    });

    await matchScoringQueue.add("score-matches", { issueId: issue.id });

    return { issueId: issue.id, classified: true };
  },
  { connection }
);
