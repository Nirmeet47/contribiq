import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getOptionalDbUserId,
  issueFeedSelect,
  serializeIssueForFeed,
  type IssueFeedRecord,
} from "@/lib/issue-feed";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const searchSchema = z.object({
  q: z.string().trim().min(1).max(80),
});

type IssueHit = { id: string; score: number };
type RepoHit = {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  categories: string[];
  stars: number;
  language: string | null;
  maintainerScore: number;
  activityScore: number;
  createdAt: Date;
  score: number;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = searchSchema.safeParse({ q: searchParams.get("q") || undefined });

  if (!parsed.success) {
    return NextResponse.json({ error: z.treeifyError(parsed.error) }, { status: 400 });
  }

  const query = parsed.data.q;
  const queryLike = `%${query}%`;
  const userId = await getOptionalDbUserId();
  const [issueHits, repos] = await Promise.all([
    prisma.$queryRaw<IssueHit[]>`
      SELECT i.id,
        (
          CASE WHEN lower(i.title) = lower(${query}) THEN 100 ELSE 0 END +
          CASE WHEN i.title ILIKE ${queryLike} THEN 40 ELSE 0 END +
          CASE WHEN COALESCE(i."aiSummary", '') ILIKE ${queryLike} THEN 24 ELSE 0 END +
          CASE WHEN r."fullName" ILIKE ${queryLike} THEN 32 ELSE 0 END +
          CASE WHEN r.name ILIKE ${queryLike} THEN 28 ELSE 0 END +
          CASE WHEN EXISTS (
            SELECT 1 FROM unnest(i."requiredSkills") AS skill
            WHERE skill ILIKE ${queryLike}
          ) THEN 24 ELSE 0 END
        )::int AS score
      FROM issues i
      JOIN repos r ON r.id = i."repoId"
      WHERE i.classified = true
        AND i.state = 'open'
        AND (
          i.title ILIKE ${queryLike}
          OR COALESCE(i."aiSummary", '') ILIKE ${queryLike}
          OR r.name ILIKE ${queryLike}
          OR r."fullName" ILIKE ${queryLike}
          OR EXISTS (
            SELECT 1 FROM unnest(i."requiredSkills") AS skill
            WHERE skill ILIKE ${queryLike}
          )
        )
      ORDER BY score DESC, i."createdAt" DESC
      LIMIT 20
    `,
    prisma.$queryRaw<RepoHit[]>`
      SELECT id, owner, name, "fullName", description, categories, stars, language,
        "maintainerScore", "activityScore", "createdAt",
        (
          CASE WHEN lower("fullName") = lower(${query}) THEN 100 ELSE 0 END +
          CASE WHEN "fullName" ILIKE ${queryLike} THEN 40 ELSE 0 END +
          CASE WHEN name ILIKE ${queryLike} THEN 32 ELSE 0 END +
          CASE WHEN COALESCE(description, '') ILIKE ${queryLike} THEN 18 ELSE 0 END +
          CASE WHEN COALESCE(language, '') ILIKE ${queryLike} THEN 16 ELSE 0 END +
          CASE WHEN categories::text ILIKE ${queryLike} THEN 14 ELSE 0 END
        )::int AS score
      FROM repos
      WHERE name ILIKE ${queryLike}
        OR "fullName" ILIKE ${queryLike}
        OR COALESCE(description, '') ILIKE ${queryLike}
        OR COALESCE(language, '') ILIKE ${queryLike}
        OR categories::text ILIKE ${queryLike}
      ORDER BY score DESC, stars DESC
      LIMIT 20
    `,
  ]);

  const issueIds = issueHits.map((hit) => hit.id);
  const issues =
    issueIds.length > 0
      ? await prisma.issue.findMany({
          where: { id: { in: issueIds } },
          select: issueFeedSelect,
        })
      : [];
  const issueById = new Map((issues as IssueFeedRecord[]).map((issue) => [issue.id, issue]));

  return NextResponse.json({
    issues: issueIds
      .map((id) => issueById.get(id))
      .filter((issue): issue is NonNullable<typeof issue> => Boolean(issue))
      .map((issue) => serializeIssueForFeed(issue, userId)),
    repos,
  });
}
