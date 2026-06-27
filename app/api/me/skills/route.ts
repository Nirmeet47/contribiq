import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/prisma";
import type { SkillLevel } from "@prisma/client";

export const dynamic = "force-dynamic";

const SKILL_LEVELS = new Set<SkillLevel>(["strong", "moderate", "learning"]);

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

    return NextResponse.json({ skills: dbUser.skillProfile.skills, summary });
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

    const githubId = parseInt(user.user_metadata?.provider_id, 10);
    const dbUser = await prisma.user.findUnique({
      where: { githubId },
      include: { skillProfile: true }
    });

    if (!dbUser || !dbUser.skillProfile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const body = await request.json();
    const incomingSkills = body.skills;

    if (!Array.isArray(incomingSkills)) {
      return NextResponse.json({ error: "Invalid skills payload" }, { status: 400 });
    }

    const skillsByName = new Map<string, { name: string; level: SkillLevel }>();
    for (const skill of incomingSkills) {
      const name = typeof skill?.name === "string" ? skill.name.trim() : "";
      const level = skill?.level as SkillLevel;

      if (!name || !SKILL_LEVELS.has(level)) {
        return NextResponse.json({ error: "Invalid skills payload" }, { status: 400 });
      }

      skillsByName.set(name.toLowerCase(), { name, level });
    }

    const skills = [...skillsByName.values()];
    const skillNames = skills.map((skill) => skill.name);
    const skillProfileId = dbUser.skillProfile.id;

    await prisma.$transaction([
      prisma.skill.deleteMany({
        where: {
          skillProfileId,
          name: { notIn: skillNames },
        },
      }),
      ...skills.map((skill) =>
        prisma.skill.upsert({
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
            repoCount: 0,
            commitCount: 0,
          },
          update: {
            level: skill.level,
          },
        })
      ),
    ]);

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
