import { NextResponse } from "next/server";
import { PROJECT_CACHE_TTL_SECONDS } from "@/lib/cache-constants";
import { getAppGitHubToken } from "@/lib/github-token";
import { prisma } from "@/lib/prisma";
import { getIssueTypeBreakdown } from "@/lib/project-intelligence";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

const BEGINNER_FRIENDLY_LABELS = new Set([
  "beginner",
  "first-timers-only",
  "good first issue",
  "good-first-issue",
  "help-wanted",
  "help wanted",
]);

type IssueLabelsRow = {
  labels: string[];
};

const PACKAGE_TECH_ALIASES: Record<string, string> = {
  "@angular/core": "Angular",
  "@nestjs/core": "NestJS",
  "@prisma/client": "Prisma",
  "@supabase/supabase-js": "Supabase",
  "@sveltejs/kit": "SvelteKit",
  "@vitejs/plugin-react": "Vite",
  "@vue/cli-service": "Vue",
  "@wdio/cli": "WebdriverIO",
  "@wdio/globals": "WebdriverIO",
  "@wdio/mocha-framework": "WebdriverIO",
  "@wdio/runner": "WebdriverIO",
  "angular": "Angular",
  "django": "Django",
  "express": "Express",
  "fastapi": "FastAPI",
  "fastify": "Fastify",
  "flask": "Flask",
  "jest": "Jest",
  "mocha": "Mocha",
  "mongoose": "MongoDB",
  "next": "Next.js",
  "nuxt": "Nuxt",
  "playwright": "Playwright",
  "prisma": "Prisma",
  "pytest": "Pytest",
  "react": "React",
  "redis": "Redis",
  "svelte": "Svelte",
  "tailwindcss": "Tailwind CSS",
  "typescript": "TypeScript",
  "vite": "Vite",
  "vue": "Vue",
  "webdriverio": "WebdriverIO",
};

function githubHeaders() {
  const token = getAppGitHubToken();

  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

async function fetchGithubLanguages(owner: string, name: string) {
  const response = await fetch(`https://api.github.com/repos/${owner}/${name}/languages`, {
    headers: githubHeaders(),
    next: { revalidate: 3600 },
  });

  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`GitHub languages fetch failed: ${response.status}`);

  const payload = (await response.json()) as Record<string, number>;

  return Object.entries(payload)
    .sort(([, a], [, b]) => b - a)
    .map(([language]) => language)
    .slice(0, 5);
}

function normalizePackageTech(packageName: string) {
  const lower = packageName.trim().toLowerCase();
  if (PACKAGE_TECH_ALIASES[lower]) return PACKAGE_TECH_ALIASES[lower];
  if (lower.startsWith("@wdio/")) return "WebdriverIO";
  if (lower.startsWith("@playwright/")) return "Playwright";
  if (lower.startsWith("@nestjs/")) return "NestJS";
  if (lower.startsWith("@vue/")) return "Vue";
  if (lower.startsWith("@angular/")) return "Angular";
  if (lower.startsWith("@sveltejs/")) return "Svelte";
  return null;
}

async function fetchManifestTech(owner: string, name: string) {
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

    return Array.from(
      new Set(packageNames.map(normalizePackageTech).filter((value): value is string => Boolean(value)))
    );
  }

  const requirements = await fetchGithubContent(owner, name, "requirements.txt");
  if (!requirements) return [];

  const packages = requirements
    .split(/\r?\n/)
    .map(extractRequirementName)
    .filter((value): value is string => Boolean(value));

  return Array.from(
    new Set(packages.map(normalizePackageTech).filter((value): value is string => Boolean(value)))
  );
}

async function fetchTechStack(owner: string, name: string, primaryLanguage: string | null) {
  const [languages, manifestTech] = await Promise.all([
    fetchGithubLanguages(owner, name).catch(() => []),
    fetchManifestTech(owner, name).catch(() => []),
  ]);

  return Array.from(new Set([primaryLanguage, ...languages, ...manifestTech].filter(Boolean) as string[])).slice(0, 12);
}

function countFromLinkHeader(linkHeader: string | null) {
  if (!linkHeader) return null;

  const lastLink = linkHeader
    .split(",")
    .map((part) => part.trim())
    .find((part) => part.includes('rel="last"'));
  const pageMatch = lastLink?.match(/[?&]page=(\d+)/);

  return pageMatch ? Number(pageMatch[1]) : null;
}

async function fetchGithubCount(url: string) {
  const response = await fetch(url, {
    headers: githubHeaders(),
    next: { revalidate: 3600 },
  });

  if (response.status === 404) return 0;
  if (!response.ok) throw new Error(`GitHub count fetch failed: ${response.status}`);

  const linkedCount = countFromLinkHeader(response.headers.get("link"));
  if (linkedCount !== null) return linkedCount;

  const payload = (await response.json()) as unknown[];
  return Array.isArray(payload) ? payload.length : 0;
}

async function fetchLastCommitAt(owner: string, name: string) {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${name}/commits?per_page=1`,
    {
      headers: githubHeaders(),
      next: { revalidate: 3600 },
    }
  );

  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub commit fetch failed: ${response.status}`);

  const payload = (await response.json()) as Array<{
    commit?: {
      committer?: {
        date?: string;
      };
      author?: {
        date?: string;
      };
    };
  }>;

  return payload[0]?.commit?.committer?.date ?? payload[0]?.commit?.author?.date ?? null;
}

async function fetchGithubStats(owner: string, name: string) {
  const [contributors, openPullRequests, lastCommitAt] = await Promise.all([
    fetchGithubCount(`https://api.github.com/repos/${owner}/${name}/contributors?per_page=1&anon=false`).catch(() => 0),
    fetchGithubCount(`https://api.github.com/repos/${owner}/${name}/pulls?state=open&per_page=1`).catch(() => 0),
    fetchLastCommitAt(owner, name).catch(() => null),
  ]);

  return {
    contributors,
    openPullRequests,
    lastCommitAt,
  };
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
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const cacheKey = `project:${projectId}:v3`;
  const cached = await redis.get(cacheKey);

  if (cached) {
    const cachedPayload = JSON.parse(cached);
    if (typeof cachedPayload?.project?.contributionFriendliness === "number") {
      return NextResponse.json(cachedPayload);
    }
  }

  const repo = await prisma.repo.findUnique({
    where: { id: projectId },
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
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const [issueBreakdown, techStack, githubStats, openIssues, openIssueLabels] = await Promise.all([
    getIssueTypeBreakdown(projectId),
    fetchTechStack(repo.owner, repo.name, repo.language),
    fetchGithubStats(repo.owner, repo.name),
    prisma.issue.findMany({
      where: { repoId: projectId, state: "open", classified: true },
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
      where: { repoId: projectId, state: "open" },
      select: { labels: true },
    }),
  ]);

  const payload = {
    project: {
      ...repo,
      contributionFriendliness: calculateContributionFriendliness({
        openIssueLabels: (openIssueLabels as IssueLabelsRow[]).map(
          (issue: IssueLabelsRow) => issue.labels
        ),
        maintainerScore: repo.maintainerScore,
      }),
    },
    githubStats,
    issueBreakdown,
    techStack,
    openIssues,
  };

  await redis.set(cacheKey, JSON.stringify(payload), "EX", PROJECT_CACHE_TTL_SECONDS);

  return NextResponse.json(payload);
}
