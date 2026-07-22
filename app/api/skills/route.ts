import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { refreshSkillEmbeddingForUser, scoreMatchesForUser } from "@/lib/ai-api";
import { invalidateUserFeedCaches } from "@/lib/feed-cache";
import { prisma } from "@/lib/prisma";
import { canonicalizeSkills, isLanguageSkill, skillIdentity } from "@/lib/skills";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

type SkillLevel = "strong" | "moderate" | "learning";

const SKILL_LEVELS = new Set<SkillLevel>(["strong", "moderate", "learning"]);

async function getAuthenticatedGithubId() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const githubIdStr = user.user_metadata?.provider_id;
  if (!githubIdStr) {
    return {
      error: NextResponse.json({ error: "No GitHub ID" }, { status: 400 }),
    };
  }

  return { githubId: parseInt(githubIdStr, 10) };
}

export async function GET() {
  try {
    const auth = await getAuthenticatedGithubId();
    if (auth.error) return auth.error;

    const dbUser = await prisma.user.findUnique({
      where: { githubId: auth.githubId },
      select: {
        skillProfile: {
          select: {
            skills: true,
          },
        },
      },
    });

    if (!dbUser?.skillProfile) {
      return NextResponse.json({ skills: [] });
    }

    return NextResponse.json({
      skills: canonicalizeSkills(dbUser.skillProfile.skills),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await getAuthenticatedGithubId();
    if (auth.error) return auth.error;

    const dbUser = await prisma.user.findUnique({
      where: { githubId: auth.githubId },
      include: { skillProfile: true },
    });

    if (!dbUser) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

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

    const savedSkills = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const skillProfile =
        dbUser.skillProfile ??
        (await tx.skillProfile.create({
          data: { userId: dbUser.id },
        }));

      await tx.skill.deleteMany({
        where: {
          skillProfileId: skillProfile.id,
          name: { notIn: skillNames },
        },
      });

      for (const skill of skills) {
        await tx.skill.upsert({
          where: {
            skillProfileId_name: {
              skillProfileId: skillProfile.id,
              name: skill.name,
            },
          },
          create: {
            skillProfileId: skillProfile.id,
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
    });

    let embeddingUpdated = false;
    let cacheInvalidated = false;
    let matchScoringTriggered = false;

    try {
      await refreshSkillEmbeddingForUser(dbUser.id);
      embeddingUpdated = true;
    } catch (error) {
      console.error("[api/skills] Failed to update skill embedding after skill edit", {
        userId: dbUser.id,
        error,
      });
    }

    try {
      await invalidateUserFeedCaches(dbUser.id, "skills-updated");
      cacheInvalidated = true;
    } catch (error) {
      console.error("[api/skills] Failed to invalidate feed caches after skill edit", {
        userId: dbUser.id,
        error,
      });
    }

    try {
      await scoreMatchesForUser(dbUser.id);
      matchScoringTriggered = true;
    } catch (error) {
      console.error("[api/skills] Failed to score matches after skill edit", {
        userId: dbUser.id,
        error,
      });
    }

    return NextResponse.json({
      success: true,
      skills: savedSkills,
      embeddingUpdated,
      cacheInvalidated,
      matchScoringTriggered,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
