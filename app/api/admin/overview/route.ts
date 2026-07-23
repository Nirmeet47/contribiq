import { NextResponse } from "next/server";
import { requireCurrentAdminUserId } from "@/lib/auth-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireCurrentAdminUserId();
  if (auth.error) return auth.error;

  const [
    repoCount,
    indexedRepoCount,
    failedRepoCount,
    pendingRepoCount,
    notIndexedRepoCount,
    openIssueCount,
    classifiedOpenIssueCount,
    issueEmbeddingCount,
    repoDocCount,
    skillEmbeddingCount,
    userCount,
    onboardedUserCount,
    profileAnalyzedUserCount,
    totalMatchCount,
  ] = await Promise.all([
    prisma.repo.count(),
    prisma.repo.count({ where: { indexingStatus: "INDEXED" } }),
    prisma.repo.count({ where: { indexingStatus: "FAILED" } }),
    prisma.repo.count({ where: { indexingStatus: "PENDING" } }),
    prisma.repo.count({ where: { indexingStatus: "NOT_INDEXED" } }),
    prisma.issue.count({ where: { state: "open" } }),
    prisma.issue.count({ where: { state: "open", classified: true } }),
    prisma.issueEmbedding.count(),
    prisma.repoDoc.count(),
    prisma.skillEmbedding.count(),
    prisma.user.count(),
    prisma.user.count({ where: { onboarded: true } }),
    prisma.user.count({ where: { profileAnalyzed: true } }),
    prisma.issueMatch.count(),
  ]);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    database: {
      repos: repoCount,
      indexedRepos: indexedRepoCount,
      failedRepos: failedRepoCount,
      pendingRepos: pendingRepoCount,
      notIndexedRepos: notIndexedRepoCount,
      openIssues: openIssueCount,
      classifiedOpenIssues: classifiedOpenIssueCount,
      issueEmbeddings: issueEmbeddingCount,
      repoDocChunks: repoDocCount,
      skillEmbeddings: skillEmbeddingCount,
      users: userCount,
      onboardedUsers: onboardedUserCount,
      notOnboardedUsers: userCount - onboardedUserCount,
      profileAnalyzedUsers: profileAnalyzedUserCount,
      totalMatches: totalMatchCount,
    },
    indexingStatus: [
      { status: "INDEXED", count: indexedRepoCount },
      { status: "PENDING", count: pendingRepoCount },
      { status: "FAILED", count: failedRepoCount },
      { status: "NOT_INDEXED", count: notIndexedRepoCount },
    ],
  });
}
