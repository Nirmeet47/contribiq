import { NextResponse } from "next/server";
import { getCachedJson, setCachedJson } from "@/lib/cache";
import {
  getOptionalDbUserId,
  issueFeedSelect,
  serializeIssueForFeed,
  type IssueFeedRecord,
} from "@/lib/issue-feed";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type TrendingRow = { issueId: string; bookmarkCount: number };

export async function GET() {
  const userId = await getOptionalDbUserId();
  const cacheKey = "discover:trending:v1";
  const cached = await getCachedJson<{ rows: TrendingRow[] }>(cacheKey, "discover");
  const rows =
    cached?.rows ??
    (await prisma.$queryRaw<TrendingRow[]>`
      SELECT b."issueId", COUNT(*)::int AS "bookmarkCount"
      FROM bookmarks b
      JOIN issues i ON i.id = b."issueId"
      WHERE b."createdAt" >= now() - interval '7 days'
        AND i.state = 'open'
        AND i.classified = true
      GROUP BY b."issueId"
      ORDER BY "bookmarkCount" DESC
      LIMIT 15
    `);

  if (!cached) {
    await setCachedJson(cacheKey, { rows }, 60 * 15, "discover");
  }

  const issueIds = rows.map((row) => row.issueId);
  const issues =
    issueIds.length > 0
      ? await prisma.issue.findMany({
          where: { id: { in: issueIds } },
          select: issueFeedSelect,
        })
      : [];
  const issueById = new Map((issues as IssueFeedRecord[]).map((issue) => [issue.id, issue]));

  return NextResponse.json({
    issues: rows
      .map((row) => {
        const issue = issueById.get(row.issueId);
        return issue
          ? { bookmarkCount: row.bookmarkCount, issue: serializeIssueForFeed(issue, userId) }
          : null;
      })
      .filter(Boolean),
  });
}
