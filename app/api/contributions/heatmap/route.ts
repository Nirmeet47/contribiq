import { NextResponse } from "next/server";
import { buildLocalContributionHeatmap } from "@/lib/contribution-activity";
import { fetchGitHubContributionStats } from "@/lib/github-contributions";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

async function getDbUser() {
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
    select: { id: true, username: true, githubToken: true },
  });

  return dbUser ?? null;
}

export async function GET() {
  const dbUser = await getDbUser();
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
