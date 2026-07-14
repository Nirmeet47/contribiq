import { NextResponse } from "next/server";
import { getCurrentDbUserId } from "@/lib/auth-user";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const userId = await getCurrentDbUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor") ?? undefined;

  const contributions = await prisma.contribution.findMany({
    where: { userId, processed: true },
    orderBy: { mergedAt: "desc" },
    take: 20,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      repoOwner: true,
      repoName: true,
      prNumber: true,
      prTitle: true,
      prUrl: true,
      mergedAt: true,
      aiDescription: true,
      skillsDemonstrated: true,
      complexity: true,
      linesAdded: true,
      linesRemoved: true,
      filesChanged: true,
    },
  });

  const nextCursor =
    contributions.length === 20 ? contributions[contributions.length - 1].id : null;

  return NextResponse.json({ contributions, nextCursor });
}
