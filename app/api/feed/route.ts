import { NextResponse } from "next/server";
import { z } from "zod";
import { appConfig } from "@/lib/app-config";
import { invalidateAllFeedCaches } from "@/lib/feed-cache";
import { getAppGitHubToken } from "@/lib/github-token";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

const feedQuerySchema = z.object({
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  issueType: z.enum(["bug", "feature", "docs", "refactor"]).optional(),
  sort: z.enum(["desc", "asc"]).default("desc"),
});

type FeedMatch = {
  issue: {
    id: string;
    state: "open" | "closed";
    updatedAt: Date;
    githubUrl: string;
    repo: {
      id: string;
      owner: string;
      name: string;
    };
  };
};

type GitHubIssueResponse = {
  state?: "open" | "closed";
  title?: string;
  body?: string | null;
  labels?: Array<{ name?: string }>;
  assignees?: unknown[];
  comments?: number;
  html_url?: string;
};

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
    select: { id: true, interests: true, timeCommitment: true },
  });
}

function issueNumberFromUrl(url: string) {
  const match = url.match(/\/issues\/(\d+)(?:[#?].*)?$/);
  return match ? Number(match[1]) : null;
}

function githubIssueHeaders() {
  const token = getAppGitHubToken();

  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function fetchGitHubIssue(owner: string, name: string, issueUrl: string) {
  const issueNumber = issueNumberFromUrl(issueUrl);
  if (!issueNumber) return null;

  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${name}/issues/${issueNumber}`,
      { headers: githubIssueHeaders() }
    );

    if (!response.ok) return null;

    return (await response.json()) as GitHubIssueResponse;
  } catch (error) {
    console.warn("[feed] Failed to lazily validate GitHub issue state", { error });
    return null;
  }
}

async function validateStaleIssues<T extends FeedMatch>(matches: T[]) {
  const now = Date.now();
  const staleMatches = matches
    .filter((match) => now - match.issue.updatedAt.getTime() > appConfig.issueValidationStaleMs)
    .slice(0, appConfig.maxStaleIssuesToValidate);

  if (staleMatches.length === 0) return matches;

  const closedIssueIds = new Set<string>();

  for (const match of staleMatches) {
    const latest = await fetchGitHubIssue(
      match.issue.repo.owner,
      match.issue.repo.name,
      match.issue.githubUrl
    );

    if (!latest?.state) continue;

    const latestState = latest.state === "closed" ? "closed" : "open";
    if (latestState === match.issue.state) continue;

    await prisma.issue.update({
      where: { id: match.issue.id },
      data: {
        state: latestState,
        title: typeof latest.title === "string" ? latest.title : undefined,
        body:
          typeof latest.body === "string" || latest.body === null
            ? latest.body
            : undefined,
        labels: latest.labels
          ?.map((label) => label.name)
          .filter((name): name is string => Boolean(name)),
        assigneeCount: Array.isArray(latest.assignees) ? latest.assignees.length : undefined,
        commentCount: typeof latest.comments === "number" ? latest.comments : undefined,
        githubUrl: typeof latest.html_url === "string" ? latest.html_url : undefined,
      },
    });

    try {
      await redis.del(`issue:${match.issue.id}`);
      await redis.del(`project:${match.issue.repo.id}`);
    } catch (error) {
      console.error("[feed] Failed to invalidate validated issue caches", {
        issueId: match.issue.id,
        repoId: match.issue.repo.id,
        error,
      });
    }

    if (latestState === "closed") {
      closedIssueIds.add(match.issue.id);
    }
  }

  if (closedIssueIds.size > 0) {
    await invalidateAllFeedCaches("lazy-issue-state-validation");
  }

  return matches.filter((match) => !closedIssueIds.has(match.issue.id));
}

export async function GET(request: Request) {
  const dbUser = await getDbUser();

  if (!dbUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if ((dbUser.interests?.length ?? 0) === 0 || dbUser.timeCommitment <= 0) {
    return NextResponse.json({
      matches: [],
      reason: "profile_incomplete",
    });
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
  const cacheKey = `feed:v3:${dbUser.id}:${difficulty ?? "all"}:${issueType ?? "all"}:${sort}:${appConfig.feedMinScore}:${appConfig.feedSkillOnlyMinScore}`;
  const cached = await redis.get(cacheKey);

  if (cached) {
    return NextResponse.json(JSON.parse(cached));
  }

  const matches = await prisma.issueMatch.findMany({
    where: {
      userId: dbUser.id,
      score: { gte: appConfig.feedMinScore },
      OR: [
        { interestSim: { gt: 0 } },
        { score: { gte: appConfig.feedSkillOnlyMinScore } },
      ],
      issue: {
        state: "open",
        ...(difficulty ? { difficulty } : {}),
        ...(issueType ? { issueType } : {}),
        feedback: {
          none: { userId: dbUser.id },
        },
      },
    },
    orderBy: { score: sort },
    take: appConfig.feedPageSize,
    select: {
      id: true,
      score: true,
      skillSim: true,
      interestSim: true,
      diffScore: true,
      issue: {
        select: {
          id: true,
          state: true,
          updatedAt: true,
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

  const visibleMatches = await validateStaleIssues(matches);

  const payload = {
    matches: visibleMatches.map((match) => ({
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
