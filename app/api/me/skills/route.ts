import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { embed } from "@/lib/embeddings";
import { invalidateUserFeedCaches } from "@/lib/feed-cache";
import { prisma } from "@/lib/prisma";
import type { SkillLevel } from "@prisma/client";
import { canonicalizeSkills, formatSkillEmbeddingText, isLanguageSkill, skillIdentity } from "@/lib/skills";

export const dynamic = "force-dynamic";

const SKILL_LEVELS = new Set<SkillLevel>(["strong", "moderate", "learning"]);

function toVectorLiteral(values: number[]) {
  return `[${values.join(",")}]`;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const githubIdStr = user.user_metadata?.provider_id;
    if (!githubIdStr) {
      return NextResponse.json({ error: "No GitHub ID" }, { status: 400 });
    }

    const githubId = parseInt(githubIdStr, 10);
    const dbUser = await prisma.user.findUnique({
      where: { githubId },
      select: {
        skillProfile: {
          select: {
            totalCommits: true,
            totalRepos: true,
            mergedPRs: true,
            skills: true,
          }
        }
      }
    });

    if (!dbUser || !dbUser.skillProfile) {
      return NextResponse.json({ skills: [], summary: { totalCommits: 0, totalRepos: 0, mergedPRs: 0 } });
    }

    const summary = {
      totalCommits: dbUser.skillProfile.totalCommits,
      totalRepos: dbUser.skillProfile.totalRepos,
      mergedPRs: dbUser.skillProfile.mergedPRs,
    };

    return NextResponse.json({
      skills: canonicalizeSkills(dbUser.skillProfile.skills),
      summary,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const githubIdStr = user.user_metadata?.provider_id;
    if (!githubIdStr) {
      return NextResponse.json({ error: "No GitHub ID" }, { status: 400 });
    }

    const githubId = parseInt(githubIdStr, 10);
    const dbUser = await prisma.user.findUnique({
      where: { githubId },
      include: { skillProfile: true }
    });

    if (!dbUser) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const skillProfile =
      dbUser.skillProfile ??
      (await prisma.skillProfile.create({
        data: { userId: dbUser.id },
      }));

    const body = await request.json();
    const incomingSkills = body.skills;

    if (!Array.isArray(incomingSkills)) {
      return NextResponse.json({ error: "Invalid skills payload" }, { status: 400 });
    }

    const skillsByName = new Map<string, { name: string; level: SkillLevel }>();
    for (const skill of incomingSkills) {
      const name = typeof skill?.name === "string" ? skill.name : "";
      const level = skill?.level as SkillLevel;

      if (!name || !SKILL_LEVELS.has(level)) {
        return NextResponse.json({ error: "Invalid skills payload" }, { status: 400 });
      }

      const [canonicalSkill] = canonicalizeSkills([{ name, level }]);
      if (canonicalSkill) {
        skillsByName.set(skillIdentity(canonicalSkill.name), {
          name: canonicalSkill.name,
          level: canonicalSkill.level,
        });
      }
    }

    const skills = [...skillsByName.values()];
    const skillNames = skills.map((skill) => skill.name);
    const skillProfileId = skillProfile.id;

    const savedSkills = await prisma.$transaction(async (tx) => {
      await tx.skill.deleteMany({
        where: {
          skillProfileId,
          name: { notIn: skillNames },
        },
      });

      for (const skill of skills) {
        await tx.skill.upsert({
          where: {
            skillProfileId_name: {
              skillProfileId,
              name: skill.name,
            },
          },
          create: {
            skillProfileId,
            name: skill.name,
            level: skill.level,
            confidence: 0.5,
            isLanguage: isLanguageSkill(skill.name),
            repoCount: 0,
            commitCount: 0,
          },
          update: {
            level: skill.level,
            isLanguage: isLanguageSkill(skill.name),
          },
        });
      }

      return tx.skill.findMany({
        where: { skillProfileId },
        orderBy: { name: "asc" },
        select: {
          name: true,
          level: true,
          confidence: true,
          repoCount: true,
          commitCount: true,
        },
      });
    });

    let embeddingUpdated = false;
    let cacheInvalidated = false;
    let matchScoringQueued = false;

    try {
      const vector = toVectorLiteral(await embed(formatSkillEmbeddingText(savedSkills)));
      await prisma.$executeRaw`
        INSERT INTO skill_embeddings (skill_profile_id, embedding, updated_at)
        VALUES (${skillProfileId}, ${vector}::vector, now())
        ON CONFLICT (skill_profile_id)
        DO UPDATE SET embedding = EXCLUDED.embedding, updated_at = now()
      `;
      embeddingUpdated = true;
    } catch (error) {
      console.error("[api/me/skills] Failed to update skill embedding after skill edit", {
        userId: dbUser.id,
        error,
      });
    }

    try {
      await invalidateUserFeedCaches(dbUser.id, "skills-updated");
      cacheInvalidated = true;
    } catch (error) {
      console.error("[api/me/skills] Failed to invalidate feed caches after skill edit", {
        userId: dbUser.id,
        error,
      });
    }

    try {
      const { matchScoringQueue } = await import("@/lib/queues");
      await matchScoringQueue.add("score-matches", { userId: dbUser.id });
      matchScoringQueued = true;
    } catch (error) {
      console.error("[api/me/skills] Failed to enqueue match scoring after skill edit", {
        userId: dbUser.id,
        error,
      });
    }

    return NextResponse.json({
      success: true,
      skills: savedSkills,
      embeddingUpdated,
      cacheInvalidated,
      matchScoringQueued,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
