import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentDbUserId } from "@/lib/auth-user";
import { invalidateUserFeedCaches } from "@/lib/feed-cache";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const bookmarkSchema = z.object({
  issueId: z.string().min(1),
});

function startOfCurrentUtcWeek() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  return start;
}

export async function GET() {
  const userId = await getCurrentDbUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [totalBookmarks, weeklyBookmarks, bookmarks] = await Promise.all([
    prisma.bookmark.count({
      where: { userId },
    }),
    prisma.bookmark.count({
      where: {
        userId,
        createdAt: { gte: startOfCurrentUtcWeek() },
      },
    }),
    prisma.bookmark.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        issue: {
          select: {
            id: true,
            title: true,
            aiSummary: true,
            difficulty: true,
            estimatedHours: true,
            issueType: true,
            githubUrl: true,
            requiredSkills: true,
            state: true,
            repo: {
              select: {
                id: true,
                owner: true,
                name: true,
                fullName: true,
                language: true,
                maintainerScore: true,
              },
            },
            workingOn: {
              where: { userId },
              select: { id: true },
            },
          },
        },
      },
    }),
  ]);

  return NextResponse.json({
    count: totalBookmarks,
    totalBookmarks,
    weeklyBookmarks,
    bookmarks: bookmarks.map((bookmark) => ({
      id: bookmark.id,
      createdAt: bookmark.createdAt,
      issue: {
        id: bookmark.issue.id,
        title: bookmark.issue.title,
        aiSummary: bookmark.issue.aiSummary,
        difficulty: bookmark.issue.difficulty,
        estimatedHours: bookmark.issue.estimatedHours,
        issueType: bookmark.issue.issueType,
        githubUrl: bookmark.issue.githubUrl,
        requiredSkills: bookmark.issue.requiredSkills,
        state: bookmark.issue.state,
        isWorking: bookmark.issue.workingOn.length > 0,
        repo: bookmark.issue.repo,
      },
    })),
  });
}

export async function POST(request: Request) {
  const userId = await getCurrentDbUserId();
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
  const userId = await getCurrentDbUserId();
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
