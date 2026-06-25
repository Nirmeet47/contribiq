import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

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
      include: {
        skillProfile: {
          include: { skills: true }
        }
      }
    });

    if (!dbUser || !dbUser.skillProfile) {
      return NextResponse.json({ skills: [], summary: { totalCommits: 0, totalRepos: 0, mergedPRs: 0 } });
    }

    // Calculate a summary from the skills
    const skills = dbUser.skillProfile.skills;
    const summary = {
      totalCommits: skills.reduce((acc, s) => acc + s.commitCount, 0),
      totalRepos: Math.max(...skills.map(s => s.repoCount), 0), // rough estimate
      mergedPRs: 0 // could be added to schema later
    };

    return NextResponse.json({ skills, summary });
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
    const newSkills = body.skills as Array<{ name: string, level: "strong" | "moderate" | "learning" }>;

    // We will update the levels of existing skills. 
    // In a full implementation, you'd handle creates/deletes properly, but for the drag & drop edit,
    // updating the level of existing matched skills is the main goal.
    for (const skill of newSkills) {
      await prisma.skill.updateMany({
        where: {
          skillProfileId: dbUser.skillProfile.id,
          name: skill.name
        },
        data: {
          level: skill.level
        }
      });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
