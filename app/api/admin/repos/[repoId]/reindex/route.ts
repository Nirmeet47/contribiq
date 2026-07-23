import { NextResponse } from "next/server";
import { requireCurrentAdminUserId } from "@/lib/auth-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ repoId: string }> }
) {
  const auth = await requireCurrentAdminUserId();
  if (auth.error) return auth.error;

  const { repoId } = await params;
  const repo = await prisma.repo.findUnique({
    where: { id: repoId },
    select: { id: true },
  });

  if (!repo) {
    return NextResponse.json({ error: "Repo not found" }, { status: 404 });
  }

  const updatedRepo = await prisma.repo.update({
    where: { id: repo.id },
    data: {
      indexingStatus: "PENDING",
      indexingError: null,
    },
    select: {
      id: true,
      fullName: true,
      indexingStatus: true,
      lastIndexedAt: true,
      indexingError: true,
    },
  });

  try {
    const { redis } = await import("@/lib/redis");
    await redis.sadd("repo_docs_ingestion:pending", repo.id);
  } catch (error) {
    console.warn("[admin/reindex] Failed to mirror pending repo in Redis", {
      repoId: repo.id,
      error,
    });
  }

  return NextResponse.json({ repo: updatedRepo });
}
