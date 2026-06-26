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

export async function GET() {
  const userId = await getDbUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contributions = await prisma.contribution.findMany({
    where: { userId, processed: true },
    orderBy: { mergedAt: "asc" },
    select: {
      mergedAt: true,
      aiDescription: true,
      complexity: true,
      prTitle: true,
    },
  });

  const grouped = new Map<
    string,
    { date: string; count: number; complexityTotal: number; snippet: string | null }
  >();

  for (const contribution of contributions) {
    const date = contribution.mergedAt.toISOString().slice(0, 10);
    const existing = grouped.get(date);

    if (existing) {
      existing.count += 1;
      existing.complexityTotal += contribution.complexity ?? 1;
      continue;
    }

    grouped.set(date, {
      date,
      count: 1,
      complexityTotal: contribution.complexity ?? 1,
      snippet: contribution.aiDescription ?? contribution.prTitle,
    });
  }

  const heatmap = Array.from(grouped.values())
    .map((cell) => ({
      date: cell.date,
      count: cell.count,
      avgComplexity: cell.complexityTotal / cell.count,
      snippet: cell.snippet,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({ heatmap });
}
