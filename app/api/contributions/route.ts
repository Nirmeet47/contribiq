import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

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

export async function GET(request: Request) {
  const userId = await getDbUserId();
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
