import { NextResponse } from "next/server";
import { z } from "zod";
import { adminPaginationSchema, paginationMeta } from "@/lib/admin-api";
import { requireCurrentAdminUserId } from "@/lib/auth-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const reposQuerySchema = adminPaginationSchema.extend({
  status: z.enum(["not_indexed", "pending", "indexed", "failed"]).optional(),
  q: z.string().trim().max(120).optional(),
});

export async function GET(request: Request) {
  const auth = await requireCurrentAdminUserId();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const parsed = reposQuerySchema.safeParse({
    page: searchParams.get("page") || undefined,
    pageSize: searchParams.get("pageSize") || undefined,
    status: searchParams.get("status") || undefined,
    q: searchParams.get("q") || undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: z.treeifyError(parsed.error) }, { status: 400 });
  }

  const { page, pageSize, status, q } = parsed.data;
  const searchWhere = q
    ? {
        OR: [
          { fullName: { contains: q, mode: "insensitive" as const } },
          { owner: { contains: q, mode: "insensitive" as const } },
          { name: { contains: q, mode: "insensitive" as const } },
          { language: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};
  const where = {
    ...searchWhere,
    ...(status ? { indexingStatus: status } : {}),
  };
  const [count, allCount, failedCount, pendingCount, indexedCount, notIndexedCount, repos] = await Promise.all([
    prisma.project.count({ where }),
    prisma.project.count({ where: searchWhere }),
    prisma.project.count({ where: { ...searchWhere, indexingStatus: "failed" } }),
    prisma.project.count({ where: { ...searchWhere, indexingStatus: "pending" } }),
    prisma.project.count({ where: { ...searchWhere, indexingStatus: "indexed" } }),
    prisma.project.count({ where: { ...searchWhere, indexingStatus: "not_indexed" } }),
    prisma.project.findMany({
      where,
      orderBy: [{ indexingStatus: "asc" }, { updatedAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        fullName: true,
        stars: true,
        language: true,
        activityScore: true,
        maintainerScore: true,
        indexingStatus: true,
        lastIndexedAt: true,
        indexingError: true,
        _count: {
          select: {
            docs: true,
            issues: { where: { state: "open" } },
          },
        },
      },
    }),
  ]);

  return NextResponse.json({
    counts: {
      ALL: allCount,
      failed: failedCount,
      pending: pendingCount,
      indexed: indexedCount,
      not_indexed: notIndexedCount,
    },
    repos: repos.map((repo) => ({
      id: repo.id,
      fullName: repo.fullName,
      stars: repo.stars,
      language: repo.language,
      activityScore: repo.activityScore,
      maintainerScore: repo.maintainerScore,
      indexingStatus: repo.indexingStatus,
      lastIndexedAt: repo.lastIndexedAt,
      indexingError: repo.indexingError,
      openIssues: repo._count.issues,
      docChunks: repo._count.docs,
    })),
    pagination: paginationMeta({ page, pageSize, count }),
  });
}

export async function POST() {
  const auth = await requireCurrentAdminUserId();
  if (auth.error) return auth.error;

  const result = await prisma.project.updateMany({
    where: { indexingStatus: "not_indexed" },
    data: {
      indexingStatus: "pending",
      indexingError: null,
    },
  });

  return NextResponse.json({ queued: result.count });
}
