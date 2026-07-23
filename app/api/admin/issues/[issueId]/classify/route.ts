import { NextResponse } from "next/server";
import {
  ISSUE_CLASSIFICATION_RATE_LIMIT,
  classifyIssueWithGroq,
  embedIssueRequiredSkills,
} from "@/lib/admin-issue-classifier";
import { requireCurrentAdminUserId } from "@/lib/auth-admin";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ issueId: string }> }
) {
  const auth = await requireCurrentAdminUserId();
  if (auth.error) return auth.error;

  const rateLimit = await checkRateLimit({
    key: `admin:${auth.userId}:issue-classify`,
    ...ISSUE_CLASSIFICATION_RATE_LIMIT,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: `Manual issue classification is limited to ${rateLimit.limit} issues per 10 minutes.`,
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
      { status: 429, headers: rateLimitHeaders(rateLimit) }
    );
  }

  const { issueId } = await params;
  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
    select: {
      id: true,
      title: true,
      body: true,
      labels: true,
      state: true,
      classified: true,
    },
  });

  if (!issue) {
    return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  }

  if (issue.state !== "open") {
    return NextResponse.json(
      { error: "Only open issues can be classified." },
      { status: 400 }
    );
  }

  const classification = await classifyIssueWithGroq(issue);
  let embeddingUpdated = false;

  try {
    const embedding = await embedIssueRequiredSkills(classification.requiredSkills);

    if (embedding) {
      await prisma.$executeRaw`
        INSERT INTO issue_embeddings (issue_id, embedding, updated_at)
        VALUES (${issue.id}, ${JSON.stringify(embedding)}::vector, now())
        ON CONFLICT (issue_id) DO UPDATE SET
          embedding = EXCLUDED.embedding,
          updated_at = now()
      `;
      embeddingUpdated = true;
    }
  } catch (error) {
    console.warn("[admin/issues/classify] Issue embedding update failed", {
      issueId: issue.id,
      error,
    });
  }

  const updatedIssue = await prisma.issue.update({
    where: { id: issue.id },
    data: {
      aiSummary: classification.aiSummary,
      difficulty: classification.difficulty,
      estimatedHours: classification.estimatedHours,
      requiredSkills: classification.requiredSkills,
      issueType: classification.issueType,
      classified: true,
    },
    select: {
      id: true,
      title: true,
      difficulty: true,
      issueType: true,
      aiSummary: true,
      classified: true,
      updatedAt: true,
      repo: {
        select: {
          fullName: true,
        },
      },
    },
  });

  return NextResponse.json(
    { issue: updatedIssue, embeddingUpdated, alreadyClassified: issue.classified },
    { headers: rateLimitHeaders(rateLimit) }
  );
}
