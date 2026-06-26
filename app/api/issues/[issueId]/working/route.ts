import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

async function getDbUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  const githubIdStr = user.user_metadata?.provider_id;
  if (!githubIdStr) return null;

  return prisma.user.findUnique({
    where: { githubId: parseInt(githubIdStr, 10) },
    select: { id: true },
  });
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ issueId: string }> }
) {
  const dbUser = await getDbUser();
  if (!dbUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { issueId } = await params;
  const existing = await prisma.workingOn.findFirst({
    where: { userId: dbUser.id, issueId },
    select: { id: true },
  });

  if (existing) {
    await prisma.workingOn.delete({ where: { id: existing.id } });
    await redis.del(`issue:${issueId}`);
    return NextResponse.json({ working: false });
  }

  await prisma.workingOn.create({
    data: {
      userId: dbUser.id,
      issueId,
    },
  });

  await redis.del(`issue:${issueId}`);

  return NextResponse.json({ working: true });
}
