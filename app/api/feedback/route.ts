import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentDbUserId } from "@/lib/auth-user";
import { invalidateUserFeedCaches } from "@/lib/feed-cache";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const feedbackSchema = z.object({
  issueId: z.string().min(1),
  type: z.literal("not_interested").default("not_interested"),
});

export async function POST(request: Request) {
  const userId = await getCurrentDbUserId();
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
