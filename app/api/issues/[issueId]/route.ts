import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ issueId: string }> }
) {
  const dbUser = await getDbUser();
  if (!dbUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { issueId } = await params;
  const cacheKey = `issue:${issueId}`;
  const cached = await redis.get(cacheKey);

  if (cached) {
    return NextResponse.json(JSON.parse(cached));
  }

  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
    select: {
      id: true,
      title: true,
      body: true,
      labels: true,
      state: true,
      assigneeCount: true,
      githubUrl: true,
      aiSummary: true,
      difficulty: true,
      estimatedHours: true,
      requiredSkills: true,
      issueType: true,
      createdAt: true,
      updatedAt: true,
      repo: {
        select: {
          id: true,
          owner: true,
          name: true,
          description: true,
          stars: true,
          maintainerScore: true,
          activityScore: true,
        },
      },
    },
  });

  if (!issue) {
    return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  }

  const [match, similarIssues, workersCount, workingOn] = await Promise.all([
    prisma.issueMatch.findFirst({
      where: { userId: dbUser.id, issueId },
      select: {
        score: true,
        skillSim: true,
        interestSim: true,
        diffScore: true,
      },
    }),
    prisma.issue.findMany({
      where: {
        id: { not: issueId },
        state: "open",
        classified: true,
        requiredSkills: { hasSome: issue.requiredSkills },
      },
      take: 5,
      select: {
        id: true,
        title: true,
        aiSummary: true,
        difficulty: true,
        issueType: true,
        githubUrl: true,
        requiredSkills: true,
      },
    }),
    prisma.workingOn.count({ where: { issueId } }),
    prisma.workingOn.findFirst({
      where: { userId: dbUser.id, issueId },
      select: { id: true },
    }),
  ]);

  const payload = {
    issue,
    match,
    similarIssues,
    workersCount,
    isWorking: Boolean(workingOn),
  };

  await redis.set(cacheKey, JSON.stringify(payload), "EX", 300);

  return NextResponse.json(payload);
}
