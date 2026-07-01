import { NextResponse } from "next/server";
import { z } from "zod";
import { invalidateUserFeedCaches } from "@/lib/feed-cache";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

const bookmarkSchema = z.object({
  issueId: z.string().min(1),
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

function startOfCurrentUtcWeek() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  return start;
}

export async function GET() {
  const userId = await getDbUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [totalBookmarks, weeklyBookmarks] = await Promise.all([
    prisma.bookmark.count({
      where: { userId },
    }),
    prisma.bookmark.count({
      where: {
        userId,
        createdAt: { gte: startOfCurrentUtcWeek() },
      },
    }),
  ]);

  return NextResponse.json({
    count: totalBookmarks,
    totalBookmarks,
    weeklyBookmarks,
  });
}

export async function POST(request: Request) {
  const userId = await getDbUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bookmarkSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: z.treeifyError(parsed.error) }, { status: 400 });
  }

  const bookmark = await prisma.bookmark.upsert({
    where: {
      userId_issueId: {
        userId,
        issueId: parsed.data.issueId,
      },
    },
    update: {},
    create: {
      userId,
      issueId: parsed.data.issueId,
    },
  });

  await invalidateUserFeedCaches(userId, "bookmark-created");

  return NextResponse.json({ bookmark });
}

export async function DELETE(request: Request) {
  const userId = await getDbUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bookmarkSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: z.treeifyError(parsed.error) }, { status: 400 });
  }

  await prisma.bookmark.deleteMany({
    where: {
      userId,
      issueId: parsed.data.issueId,
    },
  });

  await invalidateUserFeedCaches(userId, "bookmark-deleted");

  return NextResponse.json({ success: true });
}
