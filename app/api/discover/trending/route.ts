import { NextResponse } from "next/server";
import { z } from "zod";
import { getCachedJson, setCachedJson } from "@/lib/cache";
import {
  getOptionalDbUserId,
  issueFeedSelect,
  serializeIssueForFeed,
  type IssueFeedRecord,
} from "@/lib/issue-feed";
import { pageQuerySchema } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type TrendingRow = { issueId: string; bookmarkCount: number };

const querySchema = z.object({
  ...pageQuerySchema(15, 50),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    page: searchParams.get("page") || undefined,
    pageSize: searchParams.get("pageSize") || undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: z.treeifyError(parsed.error) }, { status: 400 });
  }

  const { page, pageSize } = parsed.data;
  const skip = (page - 1) * pageSize;
  const pageLimit = pageSize + 1;
  const userId = await getOptionalDbUserId();
  const cacheKey = `discover:trending:v2:${page}:${pageSize}`;
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
      OFFSET ${skip}
      LIMIT ${pageLimit}
    `);

  if (!cached) {
    await setCachedJson(cacheKey, { rows }, 60 * 15, "discover");
  }

  const visibleRows: TrendingRow[] = rows.slice(0, pageSize);
  const issueIds = visibleRows.map((row: TrendingRow) => row.issueId);
  const issues =
    issueIds.length > 0
      ? await prisma.issue.findMany({
          where: { id: { in: issueIds } },
          select: issueFeedSelect,
        })
      : [];
  const issueById = new Map((issues as IssueFeedRecord[]).map((issue) => [issue.id, issue]));

  return NextResponse.json({
    issues: visibleRows
      .map((row: TrendingRow) => {
        const issue = issueById.get(row.issueId);
        return issue
          ? { bookmarkCount: row.bookmarkCount, issue: serializeIssueForFeed(issue, userId) }
          : null;
      })
      .filter(Boolean),
    pagination: {
      page,
      pageSize,
      hasNextPage: rows.length > pageSize,
      hasPreviousPage: page > 1,
    },
  });
}
