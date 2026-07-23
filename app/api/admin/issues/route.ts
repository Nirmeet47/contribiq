import { NextResponse } from "next/server";
import { z } from "zod";
import { adminPaginationSchema, paginationMeta } from "@/lib/admin-api";
import { requireCurrentAdminUserId } from "@/lib/auth-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const issuesQuerySchema = adminPaginationSchema.extend({
  classified: z.coerce.boolean().optional(),
  repoId: z.string().min(1).optional(),
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
  });

  if (!parsed.success) {
    return NextResponse.json({ error: z.treeifyError(parsed.error) }, { status: 400 });
  }

  const { page, pageSize, classified, repoId } = parsed.data;
  const where = {
    ...(classified !== undefined ? { classified } : {}),
    ...(repoId ? { repoId } : {}),
  };
  const [count, issues] = await Promise.all([
    prisma.issue.count({ where }),
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
    issues,
    pagination: paginationMeta({ page, pageSize, count }),
  });
}
