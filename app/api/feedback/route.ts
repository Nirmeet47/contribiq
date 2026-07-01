import { NextResponse } from "next/server";
import { z } from "zod";
import { invalidateUserFeedCaches } from "@/lib/feed-cache";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

const feedbackSchema = z.object({
  issueId: z.string().min(1),
  type: z.literal("not_interested").default("not_interested"),
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

export async function POST(request: Request) {
  const userId = await getDbUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = feedbackSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: z.treeifyError(parsed.error) }, { status: 400 });
  }

  const feedback = await prisma.issueFeedback.upsert({
    where: {
      userId_issueId: {
        userId,
        issueId: parsed.data.issueId,
      },
    },
    update: { type: parsed.data.type },
    create: {
      userId,
      issueId: parsed.data.issueId,
      type: parsed.data.type,
    },
  });

  await invalidateUserFeedCaches(userId, "issue-feedback-created");

  return NextResponse.json({ feedback });
}
