import { NextResponse } from "next/server";
import { z } from "zod";
import { pageQuerySchema } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { serializeProjectSummary } from "@/lib/project-serializer";
import { getRepoLanguageCatalog } from "@/lib/repo-language-cache";

export const dynamic = "force-dynamic";
const DEFAULT_PAGE_SIZE = 9;
const MAX_PAGE_SIZE = 60;

type ProjectListRepo = {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  categories: string[];
  stars: number;
  language: string | null;
  maintainerScore: number;
  activityScore: number;
  lastFetchedAt: Date | null;
  updatedAt: Date;
};

type IssueCountRow = {
  repoId: string;
  _count: number;
};

type CategoryRow = {
  categories: string[];
};

const projectQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  category: z.string().trim().max(40).optional(),
  languages: z.array(z.string().trim().min(1).max(40)).max(50).default([]),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  minResponsiveness: z.coerce.number().min(0).max(1).optional(),
  sort: z
    .enum(["activity", "activityScore", "stars", "issues", "health", "name", "maintainerScore"])
    .default("activity"),
  ...pageQuerySchema(DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
});

function orderProjects(projects: ReturnType<typeof serializeProjectSummary>[], sort: z.infer<typeof projectQuerySchema>["sort"]) {
  return projects.sort((a, b) => {
    if (sort === "stars") return b.stars - a.stars;
    if (sort === "issues") return b.openIssueCount - a.openIssueCount;
    if (sort === "health") return b.healthScore - a.healthScore;
    if (sort === "name") return a.fullName.localeCompare(b.fullName);
    if (sort === "maintainerScore") return b.maintainerScore - a.maintainerScore;
    return b.activityScore - a.activityScore || b.openIssueCount - a.openIssueCount;
  });
}

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
    difficulty: searchParams.get("difficulty") || undefined,
    minResponsiveness: searchParams.get("minResponsiveness") || undefined,
    sort: searchParams.get("sort") || undefined,
    page: searchParams.get("page") || undefined,
    pageSize: searchParams.get("pageSize") || undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: z.treeifyError(parsed.error) }, { status: 400 });
  }

  const {
    q,
    category,
    languages: selectedLanguages,
    difficulty,
    minResponsiveness,
    sort,
    page,
    pageSize,
  } = parsed.data;
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
    ...(minResponsiveness !== undefined
      ? { maintainerScore: { gte: minResponsiveness } }
      : {}),
    ...(difficulty
      ? { issues: { some: { state: "open" as const, classified: true, difficulty } } }
      : {}),
  };

  const total = await prisma.repo.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;

  const repos: ProjectListRepo[] = await prisma.repo.findMany({
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
    skip: start,
    take: pageSize,
  });

  const repoIds = repos.map((repo: ProjectListRepo) => repo.id);
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

  const openCountByRepo = new Map(
    (openIssueCounts as IssueCountRow[]).map((item: IssueCountRow) => [item.repoId, item._count])
  );
  const classifiedCountByRepo = new Map(
    (classifiedIssueCounts as IssueCountRow[]).map((item: IssueCountRow) => [
      item.repoId,
      item._count,
    ])
  );

  const projects = orderProjects(repos
    .map((repo: ProjectListRepo) =>
      serializeProjectSummary(repo, {
        openIssueCount: openCountByRepo.get(repo.id) ?? 0,
        classifiedIssueCount: classifiedCountByRepo.get(repo.id) ?? 0,
      })
    ), sort);

  const categories = Array.from(
    new Set((categoryRows as CategoryRow[]).flatMap((repo: CategoryRow) => repo.categories).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));
  const totalOpenIssues = projects.reduce((sum, repo) => sum + repo.openIssueCount, 0);

  return NextResponse.json({
    total,
    page: currentPage,
    pageSize,
    totalPages,
    totalOpenIssues,
    hasNextPage: currentPage < totalPages,
    hasPreviousPage: currentPage > 1,
    projects,
    filters: {
      languages,
      categories,
    },
  });
}
