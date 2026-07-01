import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

const projectQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  category: z.string().trim().max(40).optional(),
  language: z.string().trim().max(40).optional(),
  sort: z.enum(["activity", "stars", "issues", "health", "name"]).default("activity"),
});

async function getDbUserId() {
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
    select: { id: true },
  });

  return dbUser?.id ?? null;
}

function healthScore(repo: { maintainerScore: number; activityScore: number }) {
  return repo.maintainerScore * 0.55 + repo.activityScore * 0.45;
}

export async function GET(request: Request) {
  const userId = await getDbUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = projectQuerySchema.safeParse({
    q: searchParams.get("q") || undefined,
    category: searchParams.get("category") || undefined,
    language: searchParams.get("language") || undefined,
    sort: searchParams.get("sort") || undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: z.treeifyError(parsed.error) }, { status: 400 });
  }

  const { q, category, language, sort } = parsed.data;
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
    ...(language ? { language: { equals: language, mode: "insensitive" as const } } : {}),
  };

  const repos = await prisma.repo.findMany({
    where,
    take: 120,
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
    prisma.repo.findMany({
      where: { language: { not: null } },
      distinct: ["language"],
      orderBy: { language: "asc" },
      select: { language: true },
    }),
    prisma.repo.findMany({
      select: { categories: true },
    }),
  ]);

  const openCountByRepo = new Map(openIssueCounts.map((item) => [item.repoId, item._count]));
  const classifiedCountByRepo = new Map(
    classifiedIssueCounts.map((item) => [item.repoId, item._count])
  );

  const projects = repos
    .map((repo) => ({
      ...repo,
      openIssueCount: openCountByRepo.get(repo.id) ?? 0,
      classifiedIssueCount: classifiedCountByRepo.get(repo.id) ?? 0,
      healthScore: healthScore(repo),
    }))
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

  return NextResponse.json({
    total: projects.length,
    repos: projects,
    filters: {
      languages: languages
        .map((repo) => repo.language)
        .filter((value): value is string => Boolean(value)),
      categories,
    },
  });
}
