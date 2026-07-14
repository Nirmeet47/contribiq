import { prisma } from "@/lib/prisma";

export type IssueType = "bug" | "feature" | "docs" | "refactor";

export const ISSUE_TYPES: IssueType[] = ["bug", "feature", "docs", "refactor"];

export async function getIssueTypeBreakdown(projectId: string) {
  const groupedIssues = await prisma.issue.groupBy({
    by: ["issueType"],
    where: { repoId: projectId, state: "open", classified: true },
    _count: true,
  });

  const issueBreakdown = ISSUE_TYPES.reduce<Record<IssueType, number>>(
    (breakdown, issueType) => {
      breakdown[issueType] = 0;
      return breakdown;
    },
    { bug: 0, feature: 0, docs: 0, refactor: 0 }
  );

  for (const item of groupedIssues) {
    if (item.issueType) {
      issueBreakdown[item.issueType] = item._count;
    }
  }

  return issueBreakdown;
}

export async function getProjectStats(projectId: string) {
  const repo = await prisma.repo.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      fullName: true,
      activityScore: true,
      maintainerScore: true,
    },
  });

  if (!repo) return null;

  const issueBreakdown = await getIssueTypeBreakdown(projectId);

  return {
    repo,
    issueBreakdown,
  };
}
