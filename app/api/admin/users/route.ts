import { NextResponse } from "next/server";
import { z } from "zod";
import { adminPaginationSchema, paginationMeta } from "@/lib/admin-api";
import { requireCurrentAdminUserId } from "@/lib/auth-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const usersQuerySchema = adminPaginationSchema.extend({
  role: z.enum(["USER", "ADMIN"]).optional(),
});

export async function GET(request: Request) {
  const auth = await requireCurrentAdminUserId();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const parsed = usersQuerySchema.safeParse({
    page: searchParams.get("page") || undefined,
    pageSize: searchParams.get("pageSize") || undefined,
    role: searchParams.get("role") || undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: z.treeifyError(parsed.error) }, { status: 400 });
  }

  const { page, pageSize, role } = parsed.data;
  const where = role ? { role } : {};
  const [count, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        username: true,
        createdAt: true,
        onboarded: true,
        profileAnalyzed: true,
        role: true,
        _count: {
          select: {
            bookmarks: true,
            workingOn: true,
            contributions: true,
          },
        },
      },
    }),
  ]);

  return NextResponse.json({
    users: users.map((user) => ({
      id: user.id,
      username: user.username,
      createdAt: user.createdAt,
      onboarded: user.onboarded,
      profileAnalyzed: user.profileAnalyzed,
      role: user.role,
      bookmarks: user._count.bookmarks,
      workingOn: user._count.workingOn,
      contributions: user._count.contributions,
    })),
    pagination: paginationMeta({ page, pageSize, count }),
  });
}
