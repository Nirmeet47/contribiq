import { NextResponse } from "next/server";
import { getCurrentDbUser } from "@/lib/auth-user";
import { buildLocalContributionHeatmap } from "@/lib/contribution-activity";
import { fetchGitHubContributionStats } from "@/lib/github-contributions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const dbUser = await getCurrentDbUser({ id: true, username: true, githubToken: true });
  if (!dbUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [contributions, githubStats] = await Promise.all([
    prisma.contribution.findMany({
      where: { userId: dbUser.id },
      orderBy: { mergedAt: "asc" },
      select: {
        mergedAt: true,
        aiDescription: true,
        complexity: true,
        prTitle: true,
      },
    }),
    fetchGitHubContributionStats(dbUser),
  ]);

  const localHeatmap = buildLocalContributionHeatmap(contributions);
  const localByDate = new Map(
    localHeatmap.map((cell) => [
      cell.date,
      {
        count: cell.count,
        complexityTotal: cell.avgComplexity * cell.count,
        snippet: cell.snippet,
      },
    ])
  );

  if (githubStats) {
    const heatmap = githubStats.contributionDays
      .filter((day) => day.contributionCount > 0)
      .map((day) => {
        const localCell = localByDate.get(day.date);

        return {
          date: day.date,
          count: day.contributionCount,
          avgComplexity: localCell
            ? localCell.complexityTotal / localCell.count
            : Math.min(4, Math.max(1, day.contributionCount)),
          snippet: localCell?.snippet ?? "GitHub contribution activity",
          source: "github",
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({ heatmap, source: "github" });
  }

  return NextResponse.json({ heatmap: localHeatmap, source: "local" });
}
