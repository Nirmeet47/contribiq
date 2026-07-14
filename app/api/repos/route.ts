import { NextResponse } from "next/server";
import { z } from "zod";
import { getCachedJson, setCachedJson } from "@/lib/cache";
import { prisma } from "@/lib/prisma";
import { getRepoLanguageCatalog } from "@/lib/repo-language-cache";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  languages: z.array(z.string().trim().min(1).max(40)).max(50).default([]),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  minResponsiveness: z.coerce.number().min(0).max(1).optional(),
  sort: z.enum(["stars", "activityScore", "maintainerScore"]).default("activityScore"),
});

function healthScore(repo: { maintainerScore: number; activityScore: number }) {
  return repo.maintainerScore * 0.55 + repo.activityScore * 0.45;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const languageParams = [
    ...searchParams.getAll("language"),
    ...(searchParams.get("languages")?.split(",") ?? []),
  ]
    .map((language) => language.trim())
    .filter(Boolean);
  const parsed = querySchema.safeParse({
    languages: [...new Set(languageParams)],
    difficulty: searchParams.get("difficulty") || undefined,
    minResponsiveness: searchParams.get("minResponsiveness") || undefined,
    sort: searchParams.get("sort") || undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: z.treeifyError(parsed.error) }, { status: 400 });
  }

  const { languages: selectedLanguages, difficulty, minResponsiveness, sort } = parsed.data;
  const languageCacheKey = selectedLanguages.length > 0 ? selectedLanguages.sort().join(",") : "all";
  const cacheKey = `repos:v2:${languageCacheKey}:${difficulty ?? "all"}:${minResponsiveness ?? "all"}:${sort}`;
  const cached = await getCachedJson<unknown>(cacheKey, "repos");
  if (cached) return NextResponse.json(cached);

  const repos = await prisma.repo.findMany({
    where: {
      ...(selectedLanguages.length > 0
        ? { language: { in: selectedLanguages, mode: "insensitive" as const } }
        : {}),
      ...(minResponsiveness !== undefined
        ? { maintainerScore: { gte: minResponsiveness } }
        : {}),
      ...(difficulty
        ? { issues: { some: { state: "open", classified: true, difficulty } } }
        : {}),
    },
    select: {
      id: true,
      owner: true,
      name: true,
      fullName: true,
      description: true,
      categories: true,
      stars: true,
      language: true,
      maintainerScore: true,
      activityScore: true,
      createdAt: true,
      _count: {
        select: {
          issues: { where: { state: "open" } },
        },
      },
    },
    orderBy: { [sort]: "desc" },
    take: 60,
  });

  const repoIds = repos.map((repo) => repo.id);
  const [difficultyRows, languages, recentRepos] = await Promise.all([
    prisma.issue.groupBy({
      by: ["repoId", "difficulty"],
      where: { repoId: { in: repoIds }, state: "open", classified: true },
      _count: true,
    }),
    getRepoLanguageCatalog(),
    prisma.repo.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        owner: true,
        name: true,
        fullName: true,
        description: true,
        categories: true,
        stars: true,
        language: true,
        maintainerScore: true,
        activityScore: true,
        createdAt: true,
        _count: {
          select: {
            issues: { where: { state: "open" } },
          },
        },
      },
    }),
  ]);

  const difficultyByRepo = new Map<string, Record<string, number>>();
  for (const row of difficultyRows) {
    if (!row.difficulty) continue;
    const current =
      difficultyByRepo.get(row.repoId) ?? { beginner: 0, intermediate: 0, advanced: 0 };
    current[row.difficulty] = row._count;
    difficultyByRepo.set(row.repoId, current);
  }

  const payload = {
    repos: repos.map((repo) => {
      const difficultyCounts =
        difficultyByRepo.get(repo.id) ?? { beginner: 0, intermediate: 0, advanced: 0 };
      const classifiedIssueCount = Object.values(difficultyCounts).reduce(
        (sum, value) => sum + value,
        0
      );

      return {
        ...repo,
        openIssueCount: repo._count.issues,
        classifiedIssueCount,
        difficultyCounts,
        healthScore: healthScore(repo),
        _count: undefined,
      };
    }),
    filters: {
      languages,
    },
    recentRepos: recentRepos.map((repo) => ({
      ...repo,
      openIssueCount: repo._count.issues,
      classifiedIssueCount: 0,
      difficultyCounts: { beginner: 0, intermediate: 0, advanced: 0 },
      healthScore: healthScore(repo),
      _count: undefined,
    })),
  };

  await setCachedJson(cacheKey, payload, 60 * 60, "repos");
  return NextResponse.json(payload);
}
