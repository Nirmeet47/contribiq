import { NextResponse } from "next/server";
import { appConfig } from "@/lib/app-config";
import { getAppGitHubToken } from "@/lib/github-token";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

const GITHUB_REST_URL = "https://api.github.com";

type GitHubComment = {
  id: number;
  html_url: string;
  body: string | null;
  created_at: string;
  user: {
    login: string;
    avatar_url: string;
    html_url: string;
  } | null;
};

type PublicIssuePayload = {
  issue: NonNullable<Awaited<ReturnType<typeof getPublicIssue>>>;
  similarIssues: Awaited<ReturnType<typeof getSimilarIssues>>;
  comments: Awaited<ReturnType<typeof fetchIssueComments>>;
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
    select: { id: true },
  });
}

function issueNumberFromUrl(url: string) {
  const match = url.match(/\/issues\/(\d+)(?:$|[?#])/);
  return match ? Number.parseInt(match[1], 10) : null;
}

async function fetchIssueComments(owner: string, repo: string, issueUrl: string) {
  const issueNumber = issueNumberFromUrl(issueUrl);
  const token = getAppGitHubToken();

  if (!issueNumber || !token) return [];

  const response = await fetch(
    `${GITHUB_REST_URL}/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=20`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
      next: { revalidate: 300 },
    }
  );

  if (!response.ok) return [];

  const comments = (await response.json()) as GitHubComment[];

  return comments.map((comment) => ({
    id: comment.id,
    body: comment.body,
    createdAt: comment.created_at,
    githubUrl: comment.html_url,
    author: comment.user
      ? {
          login: comment.user.login,
          avatarUrl: comment.user.avatar_url,
          githubUrl: comment.user.html_url,
        }
      : null,
  }));
}

async function getPublicIssue(issueId: string) {
  return prisma.issue.findUnique({
    where: { id: issueId },
    select: {
      id: true,
      title: true,
      body: true,
      labels: true,
      state: true,
      assigneeCount: true,
      commentCount: true,
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
}

async function getSimilarIssues(issueId: string, requiredSkills: string[]) {
  return prisma.issue.findMany({
    where: {
      id: { not: issueId },
      state: "open",
      classified: true,
      requiredSkills: { hasSome: requiredSkills },
    },
    take: appConfig.similarIssuesLimit,
    select: {
      id: true,
      title: true,
      aiSummary: true,
      difficulty: true,
      issueType: true,
      githubUrl: true,
      requiredSkills: true,
    },
  });
}

async function getUserIssueState(userId: string, issueId: string) {
  const [match, workersCount, workingOn] = await Promise.all([
    prisma.issueMatch.findFirst({
      where: { userId, issueId },
      select: {
        score: true,
        skillSim: true,
        interestSim: true,
        diffScore: true,
      },
    }),
    prisma.workingOn.count({ where: { issueId } }),
    prisma.workingOn.findFirst({
      where: { userId, issueId },
      select: { id: true },
    }),
  ]);

  return {
    match,
    workersCount,
    isWorking: Boolean(workingOn),
  };
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
  const issueCacheKey = `issue:${issueId}`;
  const cachedIssue = await redis.get(issueCacheKey);
  let publicPayload: PublicIssuePayload | null = cachedIssue
    ? JSON.parse(cachedIssue)
    : null;

  if (!publicPayload?.issue) {
    const issue = await getPublicIssue(issueId);

    if (!issue) {
      return NextResponse.json({ error: "Issue not found" }, { status: 404 });
    }

    const [similarIssues, comments] = await Promise.all([
      getSimilarIssues(issueId, issue.requiredSkills),
      fetchIssueComments(issue.repo.owner, issue.repo.name, issue.githubUrl),
    ]);

    publicPayload = { issue, similarIssues, comments };
    await redis.set(issueCacheKey, JSON.stringify(publicPayload), "EX", 300);
  }

  const userState = await getUserIssueState(dbUser.id, issueId);

  const payload = {
    ...publicPayload,
    ...userState,
  };

  return NextResponse.json(payload);
}
