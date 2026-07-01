import { NextResponse } from "next/server";
import { fetchGitHubContributionStats } from "@/lib/github-contributions";
import { prisma } from "@/lib/prisma";
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

  const dbUser = await prisma.user.findUnique({
    where: { githubId: parseInt(githubIdStr, 10) },
    select: { id: true, username: true, githubToken: true },
  });

  return dbUser ?? null;
}

async function getCachedPayload<T>(cacheKey: string) {
  try {
    const { redis } = await import("@/lib/redis");
    const cached = await redis.get(cacheKey);
    return cached ? (JSON.parse(cached) as T) : null;
  } catch (error) {
    console.error("[contributions] Failed to read stats cache", { cacheKey, error });
    return null;
  }
}

async function setCachedPayload(cacheKey: string, payload: unknown) {
  try {
    const { redis } = await import("@/lib/redis");
    await redis.set(cacheKey, JSON.stringify(payload), "EX", 300);
  } catch (error) {
    console.error("[contributions] Failed to write stats cache", { cacheKey, error });
  }
}

function utcDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function longestDateStreak(dates: string[]) {
  if (dates.length === 0) return 0;

  const sortedDates = [...new Set(dates)].sort();
  let longest = 1;
  let current = 1;

  for (let i = 1; i < sortedDates.length; i += 1) {
    const previous = new Date(`${sortedDates[i - 1]}T00:00:00.000Z`);
    const next = new Date(`${sortedDates[i]}T00:00:00.000Z`);
    const diffDays = Math.round((next.getTime() - previous.getTime()) / 86_400_000);

    if (diffDays === 1) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }

  return longest;
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function currentDateStreak(dates: string[]) {
  if (dates.length === 0) return 0;

  const dateSet = new Set(dates);
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const todayKey = utcDateString(today);
  const yesterday = addUtcDays(today, -1);
  const yesterdayKey = utcDateString(yesterday);

  if (!dateSet.has(todayKey) && !dateSet.has(yesterdayKey)) {
    return 0;
  }

  let cursor = dateSet.has(todayKey) ? today : yesterday;
  let streak = 0;

  while (dateSet.has(utcDateString(cursor))) {
    streak += 1;
    cursor = addUtcDays(cursor, -1);
  }

  return streak;
}

export async function GET() {
  const dbUser = await getDbUser();
  if (!dbUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cacheKey = `contributions:stats:${dbUser.id}`;
  const cached = await getCachedPayload(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  const contributions = await prisma.contribution.findMany({
    where: { userId: dbUser.id },
    select: {
      mergedAt: true,
      repoOwner: true,
      repoName: true,
      complexity: true,
    },
  });

  const uniqueRepoPairs = new Set(
    contributions.map((contribution) => `${contribution.repoOwner}/${contribution.repoName}`)
  );
  const fullNames = [...uniqueRepoPairs];

  const repos =
    fullNames.length > 0
      ? await prisma.repo.findMany({
          where: {
            fullName: { in: fullNames },
          },
          select: { fullName: true, stars: true },
        })
      : [];

  const totalReach = repos.reduce((sum, repo) => sum + repo.stars, 0);

  const contributionDates = contributions.map((contribution) => utcDateString(contribution.mergedAt));
  const githubStats = await fetchGitHubContributionStats(dbUser);
  const streakDates =
    githubStats && githubStats.contributionDates.length > 0
      ? githubStats.contributionDates
      : contributionDates;

  const payload = {
    source: githubStats ? "github" : "local",
    totalContributions: githubStats?.totalContributions ?? contributions.length,
    totalPRs: Math.max(contributions.length, githubStats?.pullRequests ?? 0),
    localMergedPRs: contributions.length,
    githubPullRequests: githubStats?.pullRequests ?? null,
    githubCommits: githubStats?.commits ?? null,
    githubIssues: githubStats?.issues ?? null,
    githubReviews: githubStats?.reviews ?? null,
    restrictedContributions: githubStats?.restricted ?? null,
    reposCount: Math.max(uniqueRepoPairs.size, githubStats?.repositoriesContributedTo ?? 0),
    currentStreak: currentDateStreak(streakDates),
    longestStreak: longestDateStreak(streakDates),
    totalReach,
  };

  await setCachedPayload(cacheKey, payload);

  return NextResponse.json(payload);
}
