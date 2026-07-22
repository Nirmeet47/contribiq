import { NextResponse } from "next/server";
import { z } from "zod";
import { appConfig } from "@/lib/app-config";
import { getCurrentDbUser } from "@/lib/auth-user";
import { getCachedJson, setCachedJson } from "@/lib/cache";
import {
  FEED_CACHE_TTL_SECONDS,
  FEED_CACHE_VERSION,
  invalidateAllFeedCaches,
} from "@/lib/feed-cache";
import { getAppGitHubToken } from "@/lib/github-token";
import { prisma } from "@/lib/prisma";
import { skillIdentity } from "@/lib/skills";

export const dynamic = "force-dynamic";

const feedQuerySchema = z.object({
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  issueType: z.enum(["bug", "feature", "docs", "refactor"]).optional(),
  languages: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  sort: z.enum(["desc", "asc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(20).default(5),
});

type FeedMatch = {
  id: string;
  score: number;
  skillSim: number;
  interestSim: number;
  diffScore: number;
  issue: {
    id: string;
    state: "open" | "closed";
    updatedAt: Date;
    title: string;
    aiSummary: string | null;
    difficulty: "beginner" | "intermediate" | "advanced" | null;
    estimatedHours: number | null;
    issueType: "bug" | "feature" | "docs" | "refactor" | null;
    githubUrl: string;
    requiredSkills: string[];
    bookmarks: Array<{ id: string }>;
    repo: {
      id: string;
      owner: string;
      name: string;
      fullName: string;
      categories: string[];
      maintainerScore: number;
      activityScore: number;
      language: string | null;
    };
  };
};

type UserLanguageSkill = {
  name: string;
};

type FeedDbUser = {
  id: string;
  interests: string[];
  timeCommitment: number;
  skillProfile: {
    skills: UserLanguageSkill[];
  } | null;
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

async function deleteIssueCaches(issueId: string, repoId: string) {
  try {
    const { redis } = await import("@/lib/redis");
    await redis.del(`issue:${issueId}`);
    await redis.del(`project:${repoId}`);
  } catch (error) {
    console.error("[feed] Failed to invalidate validated issue caches", {
      issueId,
      repoId,
      error,
    });
  }
}

async function getDbUser() {
  const dbUser = await getCurrentDbUser({
    id: true,
    interests: true,
    timeCommitment: true,
    skillProfile: {
      select: {
        skills: {
          where: { isLanguage: true },
          orderBy: { name: "asc" },
          select: { name: true },
        },
      },
    },
  });

  return dbUser as FeedDbUser | null;
}

function getUserLanguageOptions(dbUser: Awaited<ReturnType<typeof getDbUser>>) {
  const languages =
    (dbUser?.skillProfile?.skills as UserLanguageSkill[] | undefined)?.map(
      (skill: UserLanguageSkill) => skill.name
    ) ?? [];
  const byIdentity = new Map<string, string>();

  for (const language of languages) {
    byIdentity.set(skillIdentity(language), language);
  }

  return [...byIdentity.values()].sort((a, b) => a.localeCompare(b));
}

async function getLastMatchedAt(userId: string) {
  const aggregate = await prisma.issueMatch.aggregate({
    where: { userId },
    _max: { updatedAt: true },
  });

  return aggregate._max.updatedAt?.toISOString() ?? null;
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

  await Promise.all(staleMatches.map(async (match) => {
    const latest = await fetchGitHubIssue(
      match.issue.repo.owner,
      match.issue.repo.name,
      match.issue.githubUrl
    );

    if (!latest?.state) return;

    const latestState = latest.state === "closed" ? "closed" : "open";
    if (latestState === match.issue.state) return;

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

    await deleteIssueCaches(match.issue.id, match.issue.repo.id);

    if (latestState === "closed") {
      closedIssueIds.add(match.issue.id);
    }
  }));

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

  const { searchParams } = new URL(request.url);
  const languageParams = [
    ...searchParams.getAll("language"),
    ...(searchParams.get("languages")?.split(",") ?? []),
  ]
    .map((language) => language.trim())
    .filter(Boolean);
  const parsed = feedQuerySchema.safeParse({
    difficulty: searchParams.get("difficulty") || undefined,
    issueType: searchParams.get("issueType") || undefined,
    languages: [...new Set(languageParams)],
    sort: searchParams.get("sort") || undefined,
    page: searchParams.get("page") || undefined,
    pageSize: searchParams.get("pageSize") || undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: z.treeifyError(parsed.error) }, { status: 400 });
  }

  const { difficulty, issueType, languages, sort, page, pageSize } = parsed.data;
  const languageCacheKey = languages.length > 0 ? languages.sort().join(",") : "all";
  const cacheKey = `feed:${FEED_CACHE_VERSION}:v2:${dbUser.id}:${difficulty ?? "all"}:${issueType ?? "all"}:${languageCacheKey}:${sort}:${page}:${pageSize}:${appConfig.feedMinScore}:${appConfig.feedSkillOnlyMinScore}`;
  const cached = await getCachedJson<unknown>(cacheKey, "feed");

  if (cached) {
    return NextResponse.json(cached);
  }

  const userLanguageOptions = getUserLanguageOptions(dbUser);
  const lastMatchedAt = await getLastMatchedAt(dbUser.id);

  if ((dbUser.interests?.length ?? 0) === 0 || dbUser.timeCommitment <= 0) {
    return NextResponse.json({
      matches: [],
      filters: { languages: userLanguageOptions },
      status: { lastMatchedAt },
      pagination: { page, pageSize, hasNextPage: false },
      reason: "profile_incomplete",
    });
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
        ...(languages.length > 0
          ? {
              repo: {
                language: { in: languages, mode: "insensitive" as const },
              },
            }
          : {}),
        feedback: {
          none: { userId: dbUser.id },
        },
        workingOn: {
          none: { userId: dbUser.id },
        },
      },
    },
    orderBy: { score: sort },
    skip: (page - 1) * pageSize,
    take: pageSize + 1,
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

  const validatedMatches = await validateStaleIssues(matches);
  const visibleMatches = validatedMatches.slice(0, pageSize);

  const payload = {
    filters: {
      languages: userLanguageOptions,
    },
    status: {
      lastMatchedAt,
    },
    pagination: {
      page,
      pageSize,
      hasNextPage: validatedMatches.length > pageSize,
    },
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

  await setCachedJson(cacheKey, payload, FEED_CACHE_TTL_SECONDS, "feed");

  return NextResponse.json(payload);
}
