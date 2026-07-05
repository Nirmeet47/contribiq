import { NextResponse } from "next/server";
import {
  getOptionalDbUserId,
  issueFeedSelect,
  serializeIssueForFeed,
  type IssueFeedRecord,
} from "@/lib/issue-feed";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type TagRow = { tag: string; count: number };
type IssueIdRow = { id: string };
type RepoIdRow = { id: string; matchingIssueCount: number };

async function getTagCloud() {
  return prisma.$queryRaw<TagRow[]>`
    SELECT skill AS tag, COUNT(*)::int AS count
    FROM issues, unnest("requiredSkills") AS skill
    WHERE classified = true AND state = 'open'
    GROUP BY skill
    ORDER BY count DESC, skill ASC
  `;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tag: string }> }
) {
  const { tag } = await params;
  const decodedTag = decodeURIComponent(tag);
  const userId = await getOptionalDbUserId();

  const [tagCloud, issueRows, repoRows] = await Promise.all([
    getTagCloud(),
    userId
      ? prisma.$queryRaw<IssueIdRow[]>`
          SELECT i.id
          FROM issues i
          LEFT JOIN issue_matches im ON im."issueId" = i.id AND im."userId" = ${userId}
          WHERE i.classified = true
            AND i.state = 'open'
            AND EXISTS (
              SELECT 1 FROM unnest(i."requiredSkills") AS skill
              WHERE lower(skill) = lower(${decodedTag})
            )
          ORDER BY im.score DESC NULLS LAST, i."createdAt" DESC
          LIMIT 30
        `
      : prisma.$queryRaw<IssueIdRow[]>`
          SELECT i.id
          FROM issues i
          WHERE i.classified = true
            AND i.state = 'open'
            AND EXISTS (
              SELECT 1 FROM unnest(i."requiredSkills") AS skill
              WHERE lower(skill) = lower(${decodedTag})
            )
          ORDER BY i."createdAt" DESC
          LIMIT 30
        `,
    prisma.$queryRaw<RepoIdRow[]>`
      SELECT r.id, COUNT(i.id)::int AS "matchingIssueCount"
      FROM repos r
      JOIN issues i ON i."repoId" = r.id
      WHERE i.classified = true
        AND i.state = 'open'
        AND EXISTS (
          SELECT 1 FROM unnest(i."requiredSkills") AS skill
          WHERE lower(skill) = lower(${decodedTag})
        )
      GROUP BY r.id
      ORDER BY COUNT(i.id) DESC, MAX(r.stars) DESC
      LIMIT 12
    `,
  ]);

  const issueIds = issueRows.map((row) => row.id);
  const repoIds = repoRows.map((row) => row.id);
  const issues =
    issueIds.length > 0
      ? await prisma.issue.findMany({
          where: { id: { in: issueIds } },
          select: issueFeedSelect,
        })
      : [];
  const repos =
    repoIds.length > 0
      ? await prisma.repo.findMany({
          where: { id: { in: repoIds } },
          select: {
            id: true,
            owner: true,
            name: true,
            fullName: true,
            description: true,
            categories: true,
            stars: true,
            language: true,
            maintainerScore: true,
            activityScore: true,
            lastFetchedAt: true,
            _count: {
              select: {
                issues: { where: { state: "open" } },
              },
            },
          },
        })
      : [];
  const issueById = new Map((issues as IssueFeedRecord[]).map((issue) => [issue.id, issue]));
  const repoById = new Map(repos.map((repo) => [repo.id, repo]));
  const matchingIssueCountByRepo = new Map(
    repoRows.map((row) => [row.id, row.matchingIssueCount])
  );

  return NextResponse.json({
    tag: decodedTag,
    tags: tagCloud,
    repos: repoIds
      .map((id) => repoById.get(id))
      .filter((repo): repo is NonNullable<typeof repo> => Boolean(repo))
      .map((repo) => ({
        ...repo,
        healthScore: repo.maintainerScore * 0.55 + repo.activityScore * 0.45,
        openIssueCount: repo._count.issues,
        classifiedIssueCount: matchingIssueCountByRepo.get(repo.id) ?? 0,
        difficultyCounts: {},
        _count: undefined,
      })),
    issues: issueIds
      .map((id) => issueById.get(id))
      .filter((issue): issue is NonNullable<typeof issue> => Boolean(issue))
      .map((issue) => serializeIssueForFeed(issue, userId)),
  });
}
