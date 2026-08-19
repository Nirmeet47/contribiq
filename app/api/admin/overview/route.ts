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
    totalIssueCount,
    classifiedIssueCount,
    classifiedOpenIssueCount,
    issueEmbeddingCount,
    repoDocCount,
    skillEmbeddingCount,
    userCount,
    onboardedUserCount,
    profileAnalyzedUserCount,
    totalMatchCount,
  ] = await Promise.all([
    prisma.project.count(),
    prisma.project.count({ where: { indexingStatus: "indexed" } }),
    prisma.project.count({ where: { indexingStatus: "failed" } }),
    prisma.project.count({ where: { indexingStatus: "pending" } }),
    prisma.project.count({ where: { indexingStatus: "not_indexed" } }),
    prisma.issue.count({ where: { state: "open" } }),
    prisma.issue.count(),
    prisma.issue.count({ where: { classified: true } }),
    prisma.issue.count({ where: { state: "open", classified: true } }),
    prisma.issueEmbedding.count(),
    prisma.projectDoc.count(),
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
      totalIssues: totalIssueCount,
      classifiedIssues: classifiedIssueCount,
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
      { status: "indexed", count: indexedRepoCount },
      { status: "pending", count: pendingRepoCount },
      { status: "failed", count: failedRepoCount },
      { status: "not_indexed", count: notIndexedRepoCount },
    ],
  });
}
