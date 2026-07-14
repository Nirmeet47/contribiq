import { NextResponse } from "next/server";
import { getCurrentDbUserId } from "@/lib/auth-user";
import { invalidateUserFeedCaches } from "@/lib/feed-cache";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function deleteIssueCache(issueId: string) {
  try {
    const { redis } = await import("@/lib/redis");
    await redis.del(`issue:${issueId}`);
  } catch (error) {
    console.error("[working] Failed to delete issue cache", { issueId, error });
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ issueId: string }> }
) {
  const userId = await getCurrentDbUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { issueId } = await params;
  const existing = await prisma.workingOn.findFirst({
    where: { userId, issueId },
    select: { id: true },
  });

  if (existing) {
    await prisma.workingOn.delete({ where: { id: existing.id } });
    await Promise.all([
      deleteIssueCache(issueId),
      invalidateUserFeedCaches(userId, "working-cleared"),
    ]);
    return NextResponse.json({ working: false });
  }

  await prisma.workingOn.create({
    data: {
      userId,
      issueId,
    },
  });

  await Promise.all([
    deleteIssueCache(issueId),
    invalidateUserFeedCaches(userId, "working-created"),
  ]);

  return NextResponse.json({ working: true });
}
