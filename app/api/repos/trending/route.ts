import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { skillIdentity } from "@/lib/skills";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

async function getDbUserId() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  const githubIdStr = user.user_metadata?.provider_id;
  if (!githubIdStr) return null;

  const dbUser = await prisma.user.findUnique({
    where: { githubId: parseInt(githubIdStr, 10) },
    select: { id: true },
  });

  return dbUser?.id ?? null;
}

export async function GET() {
  const userId = await getDbUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const skillProfile = await prisma.skillProfile.findUnique({
    where: { userId },
    select: {
      skills: {
        select: { name: true },
      },
    },
  });

  const normalizedSkills = new Set(
    (skillProfile?.skills ?? [])
      .map((skill) => skillIdentity(skill.name))
      .filter(Boolean)
  );

  if (normalizedSkills.size === 0) {
    return NextResponse.json({ repos: [] });
  }

  const repos = await prisma.repo.findMany({
    select: {
      id: true,
      owner: true,
      name: true,
      fullName: true,
      description: true,
      language: true,
      stars: true,
      categories: true,
      activityScore: true,
    },
    orderBy: [{ activityScore: "desc" }, { stars: "desc" }],
  });

  const matchingRepos = repos
    .filter((repo) => {
      const languageMatches =
        repo.language !== null && normalizedSkills.has(skillIdentity(repo.language));
      const categoryMatches = repo.categories.some((category) =>
        normalizedSkills.has(skillIdentity(category))
      );

      return languageMatches || categoryMatches;
    })
    .slice(0, 3);

  return NextResponse.json({ repos: matchingRepos });
}
