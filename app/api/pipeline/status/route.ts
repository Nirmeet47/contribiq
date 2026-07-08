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

async function getQueueStatus() {
  return {
    available: true,
    queues: [],
    pythonJobs: [
      { name: "Repo discovery", command: "npm run ai:worker" },
      { name: "Repo docs ingestion", command: "npm run ai:worker" },
      { name: "Issue fetch", command: "npm run ai:worker" },
      { name: "Issue classification + embeddings", command: "npm run ai:worker" },
      { name: "Match scoring", command: "npm run ai:worker" },
      { name: "Contribution summary", command: "npm run ai:worker" },
      { name: "Project RAG / Q&A", command: "npm run ai:api" },
    ],
  };
}

export async function GET() {
  const userId = await getDbUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [
    repoCount,
    issueCount,
    classifiedIssueCount,
    issueEmbeddingCount,
    skillEmbeddingCount,
    userMatchCount,
    dismissedIssueCount,
    strongUserMatchCount,
    queueStatus,
  ] = await Promise.all([
    prisma.repo.count(),
    prisma.issue.count({ where: { state: "open" } }),
    prisma.issue.count({ where: { state: "open", classified: true } }),
    prisma.issueEmbedding.count(),
    prisma.skillEmbedding.count(),
    prisma.issueMatch.count({ where: { userId } }),
    prisma.issueFeedback.count({ where: { userId } }),
    prisma.issueMatch.count({
      where: {
        userId,
        score: { gte: 0.5 },
        OR: [{ interestSim: { gt: 0 } }, { score: { gte: 0.65 } }],
        issue: {
          state: "open",
          feedback: {
            none: { userId },
          },
        },
      },
    }),
    getQueueStatus(),
  ]);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    database: {
      repos: repoCount,
      openIssues: issueCount,
      classifiedOpenIssues: classifiedIssueCount,
      issueEmbeddings: issueEmbeddingCount,
      skillEmbeddings: skillEmbeddingCount,
      userMatches: userMatchCount,
      dismissedIssues: dismissedIssueCount,
      strongUserMatches: strongUserMatchCount,
    },
    queues: queueStatus,
  });
}
