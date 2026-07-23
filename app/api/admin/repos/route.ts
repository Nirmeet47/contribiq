import { NextResponse } from "next/server";
import { z } from "zod";
import { adminPaginationSchema, paginationMeta } from "@/lib/admin-api";
import { requireCurrentAdminUserId } from "@/lib/auth-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const reposQuerySchema = adminPaginationSchema.extend({
  status: z.enum(["NOT_INDEXED", "PENDING", "INDEXED", "FAILED"]).optional(),
});

export async function GET(request: Request) {
  const auth = await requireCurrentAdminUserId();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const parsed = reposQuerySchema.safeParse({
    page: searchParams.get("page") || undefined,
    pageSize: searchParams.get("pageSize") || undefined,
    status: searchParams.get("status") || undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: z.treeifyError(parsed.error) }, { status: 400 });
  }

  const { page, pageSize, status } = parsed.data;
  const where = status ? { indexingStatus: status } : {};
  const [count, repos] = await Promise.all([
    prisma.repo.count({ where }),
    prisma.repo.findMany({
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
