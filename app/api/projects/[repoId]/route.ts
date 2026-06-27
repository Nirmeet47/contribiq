import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { normalizeTechName } from "@/lib/tech-names";

export const dynamic = "force-dynamic";

type IssueType = "bug" | "feature" | "docs" | "refactor";

const ISSUE_TYPES: IssueType[] = ["bug", "feature", "docs", "refactor"];
const BEGINNER_FRIENDLY_LABELS = new Set([
  "beginner",
  "first-timers-only",
  "good first issue",
  "good-first-issue",
  "help-wanted",
  "help wanted",
]);

function githubHeaders() {
  return {
    ...(process.env.GITHUB_TOKEN
      ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
      : {}),
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function extractRequirementName(line: string) {
  const withoutComment = line.split("#")[0].trim();
  if (!withoutComment || withoutComment.startsWith("-")) return null;

  const match = withoutComment.match(/^([A-Za-z0-9_.-]+)/);
  return match?.[1] ?? null;
}

async function fetchGithubContent(owner: string, name: string, filePath: string) {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${name}/contents/${filePath}`,
    {
      headers: githubHeaders(),
      next: { revalidate: 3600 },
    }
  );

  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub content fetch failed: ${response.status}`);

  const payload = (await response.json()) as { content?: string };
  if (!payload.content) return null;

  return Buffer.from(payload.content.replace(/\n/g, ""), "base64").toString("utf-8");
}

async function fetchTechStack(owner: string, name: string) {
  const packageJson = await fetchGithubContent(owner, name, "package.json");

  if (packageJson) {
    const parsed = JSON.parse(packageJson) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    const packageNames = [
      ...Object.keys(parsed.dependencies ?? {}),
      ...Object.keys(parsed.devDependencies ?? {}),
    ];

    return Array.from(new Set(packageNames.map(normalizeTechName).filter(Boolean))).slice(0, 12);
  }

  const requirements = await fetchGithubContent(owner, name, "requirements.txt");
  if (!requirements) return [];

  const packages = requirements
    .split(/\r?\n/)
    .map(extractRequirementName)
    .filter((value): value is string => Boolean(value));

  return Array.from(new Set(packages.map(normalizeTechName).filter(Boolean))).slice(0, 12);
}

function calculateContributionFriendliness({
  openIssueLabels,
  maintainerScore,
}: {
  openIssueLabels: string[][];
  maintainerScore: number;
}) {
  if (openIssueLabels.length === 0) return 0;

  const beginnerFriendlyCount = openIssueLabels.filter((labels) =>
    labels.some((label) => BEGINNER_FRIENDLY_LABELS.has(label.trim().toLowerCase()))
  ).length;
  const beginnerFriendlyRatio = beginnerFriendlyCount / openIssueLabels.length;

  return Math.max(
    0,
    Math.min(1, beginnerFriendlyRatio * 0.7 + maintainerScore * 0.3)
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ repoId: string }> }
) {
  const { repoId } = await params;
  const cacheKey = `project:${repoId}`;
  const cached = await redis.get(cacheKey);

  if (cached) {
    const cachedPayload = JSON.parse(cached);
    if (typeof cachedPayload?.repo?.contributionFriendliness === "number") {
      return NextResponse.json(cachedPayload);
    }
  }

  const repo = await prisma.repo.findUnique({
    where: { id: repoId },
    select: {
      id: true,
      owner: true,
      name: true,
      description: true,
      stars: true,
      language: true,
      categories: true,
      maintainerScore: true,
      activityScore: true,
    },
  });

  if (!repo) {
    return NextResponse.json({ error: "Repo not found" }, { status: 404 });
  }

  const [groupedIssues, techStack, openIssues, openIssueLabels] = await Promise.all([
    prisma.issue.groupBy({
      by: ["issueType"],
      where: { repoId, state: "open", classified: true },
      _count: true,
    }),
    fetchTechStack(repo.owner, repo.name),
    prisma.issue.findMany({
      where: { repoId, state: "open", classified: true },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: {
        id: true,
        title: true,
        aiSummary: true,
        difficulty: true,
        issueType: true,
        estimatedHours: true,
        githubUrl: true,
        requiredSkills: true,
      },
    }),
    prisma.issue.findMany({
      where: { repoId, state: "open" },
      select: { labels: true },
    }),
  ]);

  const issueBreakdown = ISSUE_TYPES.reduce<Record<IssueType, number>>(
    (breakdown, issueType) => {
      breakdown[issueType] = 0;
      return breakdown;
    },
    { bug: 0, feature: 0, docs: 0, refactor: 0 }
  );

  for (const item of groupedIssues) {
    if (item.issueType) {
      issueBreakdown[item.issueType] = item._count;
    }
  }

  const payload = {
    repo: {
      ...repo,
      contributionFriendliness: calculateContributionFriendliness({
        openIssueLabels: openIssueLabels.map((issue) => issue.labels),
        maintainerScore: repo.maintainerScore,
      }),
    },
    issueBreakdown,
    techStack,
    openIssues,
  };

  await redis.set(cacheKey, JSON.stringify(payload), "EX", 60 * 60);

  return NextResponse.json(payload);
}
