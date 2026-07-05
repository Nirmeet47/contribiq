import { prisma } from "@/lib/prisma";

export type HeatmapCell = {
  date: string;
  count: number;
  avgComplexity: number;
  snippet: string | null;
  source: "local";
};

export function utcDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function buildLocalContributionHeatmap(
  contributions: Array<{
    mergedAt: Date;
    aiDescription: string | null;
    complexity: number | null;
    prTitle: string;
  }>
) {
  const localByDate = new Map<
    string,
    { date: string; count: number; complexityTotal: number; snippet: string | null }
  >();

  for (const contribution of contributions) {
    const date = utcDateString(contribution.mergedAt);
    const existing = localByDate.get(date);

    if (existing) {
      existing.count += 1;
      existing.complexityTotal += contribution.complexity ?? 1;
      continue;
    }

    localByDate.set(date, {
      date,
      count: 1,
      complexityTotal: contribution.complexity ?? 1,
      snippet: contribution.aiDescription ?? contribution.prTitle,
    });
  }

  return Array.from(localByDate.values())
    .map((cell) => ({
      date: cell.date,
      count: cell.count,
      avgComplexity: cell.complexityTotal / cell.count,
      snippet: cell.snippet,
      source: "local" as const,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function getLocalContributionHeatmap(userId: string) {
  const contributions = await prisma.contribution.findMany({
    where: { userId },
    orderBy: { mergedAt: "asc" },
    select: {
      mergedAt: true,
      aiDescription: true,
      complexity: true,
      prTitle: true,
    },
  });

  return buildLocalContributionHeatmap(contributions);
}
