import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { serializeProjectSummary } from "@/lib/project-serializer";
import { getRepoLanguageCatalog } from "@/lib/repo-language-cache";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 9;

const projectQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  category: z.string().trim().max(40).optional(),
  languages: z.array(z.string().trim().min(1).max(40)).max(50).default([]),
  sort: z.enum(["activity", "stars", "issues", "health", "name"]).default("activity"),
  page: z.coerce.number().int().min(1).default(1),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const languageParams = [
    ...searchParams.getAll("language"),
    ...(searchParams.get("languages")?.split(",") ?? []),
  ]
    .map((language) => language.trim())
    .filter(Boolean);
  const parsed = projectQuerySchema.safeParse({
    q: searchParams.get("q") || undefined,
    category: searchParams.get("category") || undefined,
    languages: [...new Set(languageParams)],
    sort: searchParams.get("sort") || undefined,
    page: searchParams.get("page") || undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: z.treeifyError(parsed.error) }, { status: 400 });
  }

  const { q, category, languages: selectedLanguages, sort, page } = parsed.data;
  const where = {
    ...(q
      ? {
          OR: [
            { fullName: { contains: q, mode: "insensitive" as const } },
            { name: { contains: q, mode: "insensitive" as const } },
            { owner: { contains: q, mode: "insensitive" as const } },
            { description: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(category ? { categories: { has: category } } : {}),
    ...(selectedLanguages.length > 0
      ? { language: { in: selectedLanguages, mode: "insensitive" as const } }
      : {}),
  };

  const repos = await prisma.repo.findMany({
    where,
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
      lastFetchedAt: true,
      updatedAt: true,
    },
  });

  const repoIds = repos.map((repo) => repo.id);
  const [openIssueCounts, classifiedIssueCounts, languages, categoryRows] = await Promise.all([
    prisma.issue.groupBy({
      by: ["repoId"],
      where: { repoId: { in: repoIds }, state: "open" },
      _count: true,
    }),
    prisma.issue.groupBy({
      by: ["repoId"],
      where: { repoId: { in: repoIds }, state: "open", classified: true },
      _count: true,
    }),
    getRepoLanguageCatalog(),
    prisma.repo.findMany({
      select: { categories: true },
    }),
  ]);

  const openCountByRepo = new Map(openIssueCounts.map((item) => [item.repoId, item._count]));
  const classifiedCountByRepo = new Map(
    classifiedIssueCounts.map((item) => [item.repoId, item._count])
  );

  const projects = repos
    .map((repo) =>
      serializeProjectSummary(repo, {
        openIssueCount: openCountByRepo.get(repo.id) ?? 0,
        classifiedIssueCount: classifiedCountByRepo.get(repo.id) ?? 0,
      })
    )
    .sort((a, b) => {
      if (sort === "stars") return b.stars - a.stars;
      if (sort === "issues") return b.openIssueCount - a.openIssueCount;
      if (sort === "health") return b.healthScore - a.healthScore;
      if (sort === "name") return a.fullName.localeCompare(b.fullName);
      return b.activityScore - a.activityScore || b.openIssueCount - a.openIssueCount;
    });

  const categories = Array.from(
    new Set(categoryRows.flatMap((repo) => repo.categories).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));
  const total = projects.length;
  const totalOpenIssues = projects.reduce((sum, repo) => sum + repo.openIssueCount, 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const paginatedProjects = projects.slice(start, start + PAGE_SIZE);

  return NextResponse.json({
    total,
    page: currentPage,
    pageSize: PAGE_SIZE,
    totalPages,
    totalOpenIssues,
    hasNextPage: currentPage < totalPages,
    hasPreviousPage: currentPage > 1,
    projects: paginatedProjects,
    filters: {
      languages,
      categories,
    },
  });
}
