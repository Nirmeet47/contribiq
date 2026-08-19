import { NextResponse } from "next/server";
import { z } from "zod";
import { adminPaginationSchema, paginationMeta } from "@/lib/admin-api";
import { requireCurrentAdminUserId } from "@/lib/auth-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const issuesQuerySchema = adminPaginationSchema.extend({
  classified: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  issueType: z.enum(["bug", "feature", "docs", "refactor"]).optional(),
  projectId: z.string().min(1).optional(),
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
    difficulty: searchParams.get("difficulty") || undefined,
    issueType: searchParams.get("issueType") || undefined,
    projectId: searchParams.get("projectId") || undefined,
    q: searchParams.get("q") || undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: z.treeifyError(parsed.error) }, { status: 400 });
  }

  const { page, pageSize, classified, difficulty, issueType, projectId, q } = parsed.data;
  const searchWhere = q
    ? {
        OR: [
          { title: { contains: q, mode: "insensitive" as const } },
          { aiSummary: { contains: q, mode: "insensitive" as const } },
          { project: { fullName: { contains: q, mode: "insensitive" as const } } },
        ],
      }
    : {};
  const typedWhere = {
    ...searchWhere,
    ...(difficulty ? { difficulty } : {}),
    ...(issueType ? { issueType } : {}),
    ...(projectId ? { projectId } : {}),
  };
  const where = {
    ...typedWhere,
    ...(classified !== undefined ? { classified } : {}),
  };
  const [count, allCount, unclassifiedCount, issues] = await Promise.all([
    prisma.issue.count({ where }),
    prisma.issue.count({ where: typedWhere }),
    prisma.issue.count({ where: { ...typedWhere, classified: false } }),
    prisma.issue.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        title: true,
        projectId: true,
        difficulty: true,
        issueType: true,
        aiSummary: true,
        classified: true,
        updatedAt: true,
        project: {
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
