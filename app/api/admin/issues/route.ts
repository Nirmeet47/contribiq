import { NextResponse } from "next/server";
import { z } from "zod";
import { adminPaginationSchema, paginationMeta } from "@/lib/admin-api";
import { requireCurrentAdminUserId } from "@/lib/auth-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const issuesQuerySchema = adminPaginationSchema.extend({
  classified: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  repoId: z.string().min(1).optional(),
  q: z.string().trim().max(120).optional(),
});

export async function GET(request: Request) {
  const auth = await requireCurrentAdminUserId();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const parsed = issuesQuerySchema.safeParse({
    page: searchParams.get("page") || undefined,
    pageSize: searchParams.get("pageSize") || undefined,
    classified: searchParams.get("classified") || undefined,
    repoId: searchParams.get("repoId") || undefined,
    q: searchParams.get("q") || undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: z.treeifyError(parsed.error) }, { status: 400 });
  }

  const { page, pageSize, classified, repoId, q } = parsed.data;
  const searchWhere = q
    ? {
        OR: [
          { title: { contains: q, mode: "insensitive" as const } },
          { aiSummary: { contains: q, mode: "insensitive" as const } },
          { repo: { fullName: { contains: q, mode: "insensitive" as const } } },
        ],
      }
    : {};
  const where = {
    ...searchWhere,
    ...(classified !== undefined ? { classified } : {}),
    ...(repoId ? { repoId } : {}),
  };
  const [count, allCount, unclassifiedCount, issues] = await Promise.all([
    prisma.issue.count({ where }),
    prisma.issue.count({ where: searchWhere }),
    prisma.issue.count({ where: { ...searchWhere, classified: false } }),
    prisma.issue.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        title: true,
        repoId: true,
        difficulty: true,
        issueType: true,
        aiSummary: true,
        classified: true,
        updatedAt: true,
        repo: {
          select: {
            fullName: true,
          },
        },
      },
    }),
  ]);

  return NextResponse.json({
    counts: {
      ALL: allCount,
      UNCLASSIFIED: unclassifiedCount,
    },
    issues,
    pagination: paginationMeta({ page, pageSize, count }),
  });
}
