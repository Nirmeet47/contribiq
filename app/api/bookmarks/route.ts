import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
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

export async function GET() {
  const userId = await getDbUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const count = await prisma.bookmark.count({
    where: { userId },
  });

  return NextResponse.json({ count });
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

  const cacheKeys = await redis.keys(`feed:${userId}:*`);
  if (cacheKeys.length > 0) {
    await redis.del(...cacheKeys);
  }

  return NextResponse.json({ bookmark });
}
