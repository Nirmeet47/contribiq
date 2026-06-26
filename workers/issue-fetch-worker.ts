import "dotenv/config";

import { Worker, type ConnectionOptions } from "bullmq";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { issueClassificationQueue } from "@/lib/queues";

const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";
const ISSUE_PAGE_SIZE = 50;
const connection = redis as unknown as ConnectionOptions;

type GitHubIssueNode = {
  databaseId: number | null;
  title: string;
  body: string | null;
  url: string;
  state: "OPEN" | "CLOSED";
  assignees: { totalCount: number };
  comments: { totalCount: number };
  labels: { nodes: Array<{ name: string }> };
};

type GitHubIssuesResponse = {
  data?: {
    repository: {
      issues: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: GitHubIssueNode[];
      };
    } | null;
  };
  errors?: Array<{ message: string }>;
};

const fetchIssuesQuery = `
  query FetchOpenIssues($owner: String!, $name: String!, $first: Int!, $after: String) {
    repository(owner: $owner, name: $name) {
      issues(first: $first, after: $after, states: OPEN, orderBy: { field: UPDATED_AT, direction: DESC }) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          databaseId
          title
          body
          url
          state
          assignees {
            totalCount
          }
          comments {
            totalCount
          }
          labels(first: 20) {
            nodes {
              name
            }
          }
        }
      }
    }
  }
`;

function getGitHubToken() {
  const token = process.env.GITHUB_PAT;
  if (!token) {
    throw new Error("GITHUB_PAT is not set");
  }
  return token;
}

async function fetchOpenIssues(owner: string, name: string) {
  const token = getGitHubToken();
  const issues: GitHubIssueNode[] = [];
  let after: string | null = null;

  do {
    const response = await fetch(GITHUB_GRAPHQL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: fetchIssuesQuery,
        variables: { owner, name, first: ISSUE_PAGE_SIZE, after },
      }),
    });

    if (!response.ok) {
      throw new Error(`GitHub GraphQL request failed: ${response.status}`);
    }

    const payload = (await response.json()) as GitHubIssuesResponse;
    if (payload.errors?.length) {
      throw new Error(
        `GitHub GraphQL error: ${payload.errors.map((e) => e.message).join("; ")}`
      );
    }

    const page = payload.data?.repository?.issues;
    if (!page) return issues;

    issues.push(...page.nodes);
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after);

  return issues;
}

export const issueFetchWorker = new Worker(
  "issue-fetch",
  async () => {
    const repos = await prisma.repo.findMany({
      select: { id: true, owner: true, name: true, fullName: true },
    });

    let created = 0;

    for (const repo of repos) {
      const issues = await fetchOpenIssues(repo.owner, repo.name);

      for (const issue of issues) {
        if (!issue.databaseId) continue;

        const existing = await prisma.issue.findUnique({
          where: {
            githubId_repoId: {
              githubId: issue.databaseId,
              repoId: repo.id,
            },
          },
          select: { id: true },
        });

        if (existing) {
          await prisma.issue.update({
            where: { id: existing.id },
            data: {
              title: issue.title,
              body: issue.body,
              labels: issue.labels.nodes.map((label) => label.name),
              state: "open",
              assigneeCount: issue.assignees.totalCount,
              commentCount: issue.comments.totalCount,
              githubUrl: issue.url,
            },
          });
          continue;
        }

        const createdIssue = await prisma.issue.create({
          data: {
            githubId: issue.databaseId,
            repoId: repo.id,
            title: issue.title,
            body: issue.body,
            labels: issue.labels.nodes.map((label) => label.name),
            state: "open",
            assigneeCount: issue.assignees.totalCount,
            commentCount: issue.comments.totalCount,
            githubUrl: issue.url,
            classified: false,
          },
          select: { id: true },
        });

        created += 1;
        await issueClassificationQueue.add("classify-issue", {
          issueId: createdIssue.id,
        });
      }

      await prisma.repo.update({
        where: { id: repo.id },
        data: { lastFetchedAt: new Date() },
      });
    }

    return { repos: repos.length, created };
  },
  { connection }
);
