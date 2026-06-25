import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

const feedQuerySchema = z.object({
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  issueType: z.enum(["bug", "feature", "docs", "refactor"]).optional(),
  sort: z.enum(["desc", "asc"]).default("desc"),
});

async function getDbUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  const githubIdStr = user.user_metadata?.provider_id;
  if (!githubIdStr) return null;

  return prisma.user.findUnique({
    where: { githubId: parseInt(githubIdStr, 10) },
    select: { id: true },
  });
}

export async function GET(request: Request) {
  const dbUser = await getDbUser();

  if (!dbUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = feedQuerySchema.safeParse({
    difficulty: searchParams.get("difficulty") || undefined,
    issueType: searchParams.get("issueType") || undefined,
    sort: searchParams.get("sort") || undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: z.treeifyError(parsed.error) }, { status: 400 });
  }

  const { difficulty, issueType, sort } = parsed.data;
  const cacheKey = `feed:${dbUser.id}:${difficulty ?? "all"}:${issueType ?? "all"}:${sort}`;
  const cached = await redis.get(cacheKey);

  if (cached) {
    return NextResponse.json(JSON.parse(cached));
  }

  const matches = await prisma.issueMatch.findMany({
    where: {
      userId: dbUser.id,
      issue: {
        ...(difficulty ? { difficulty } : {}),
        ...(issueType ? { issueType } : {}),
        feedback: {
          none: { userId: dbUser.id },
        },
      },
    },
    orderBy: { score: sort },
    take: 30,
    select: {
      id: true,
      score: true,
      skillSim: true,
      interestSim: true,
      diffScore: true,
      issue: {
        select: {
          id: true,
          title: true,
          aiSummary: true,
          difficulty: true,
          estimatedHours: true,
          issueType: true,
          githubUrl: true,
          requiredSkills: true,
          repo: {
            select: {
              id: true,
              owner: true,
              name: true,
              fullName: true,
              categories: true,
              maintainerScore: true,
              activityScore: true,
              language: true,
            },
          },
          bookmarks: {
            where: { userId: dbUser.id },
            select: { id: true },
          },
        },
      },
    },
  });

  const payload = {
    matches: matches.map((match) => ({
      id: match.id,
      score: match.score,
      skillSim: match.skillSim,
      interestSim: match.interestSim,
      diffScore: match.diffScore,
      issue: {
        id: match.issue.id,
        title: match.issue.title,
        aiSummary: match.issue.aiSummary,
        difficulty: match.issue.difficulty,
        estimatedHours: match.issue.estimatedHours,
        issueType: match.issue.issueType,
        githubUrl: match.issue.githubUrl,
        requiredSkills: match.issue.requiredSkills,
        bookmarked: match.issue.bookmarks.length > 0,
        repo: {
          id: match.issue.repo.id,
          owner: match.issue.repo.owner,
          name: match.issue.repo.name,
          fullName: match.issue.repo.fullName,
          categories: match.issue.repo.categories,
          maintainerScore: match.issue.repo.maintainerScore,
          activityScore: match.issue.repo.activityScore,
          language: match.issue.repo.language,
        },
      },
    })),
  };

  await redis.set(cacheKey, JSON.stringify(payload), "EX", 300);

  return NextResponse.json(payload);
}
