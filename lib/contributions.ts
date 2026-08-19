import { processContributionWithAi } from "@/lib/contribution-ai";
import { invalidateContributionStats } from "@/lib/contribution-cache";
import { prisma } from "@/lib/prisma";

type RecordMergedContributionInput = {
  userId: string;
  repoOwner: string;
  repoName: string;
  prNumber: number;
  prTitle: string;
  prUrl: string;
  mergedAt: Date;
  logContext?: string;
};

export async function recordMergedContribution({
  userId,
  repoOwner,
  repoName,
  prNumber,
  prTitle,
  prUrl,
  mergedAt,
  logContext = "contributions",
}: RecordMergedContributionInput) {
  const contribution = await prisma.contribution.upsert({
    where: {
      userId_repoOwner_repoName_prNumber: {
        userId,
        repoOwner,
        repoName,
        prNumber,
      },
    },
    update: {
      prTitle,
      prUrl,
      mergedAt,
      processed: false,
    },
    create: {
      userId,
      repoOwner,
      repoName,
      prNumber,
      prTitle,
      prUrl,
      mergedAt,
      processed: false,
    },
  });

  await invalidateContributionStats(userId);

  processContributionWithAi(contribution.id).catch((error) => {
    console.error(`[${logContext}] Failed to trigger Python contribution processing`, {
      contributionId: contribution.id,
      error,
    });
  });

  return contribution;
}
