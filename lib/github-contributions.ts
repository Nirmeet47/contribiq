import { decryptGithubToken, getAppGitHubToken } from "@/lib/github-token";

export type GitHubContributionDay = {
  date: string;
  contributionCount: number;
};

export type GitHubContributionStats = {
  commits: number;
  issues: number;
  pullRequests: number;
  reviews: number;
  restricted: number;
  totalContributions: number;
  repositoriesContributedTo: number;
  contributionDays: GitHubContributionDay[];
  contributionDates: string[];
};

type GitHubUser = {
  id: string;
  username: string;
  githubToken: string | null;
};

type GitHubGraphQlResponse = {
  data?: {
    user?: {
      contributionsCollection?: {
        totalCommitContributions: number;
        totalIssueContributions: number;
        totalPullRequestContributions: number;
        totalPullRequestReviewContributions: number;
        restrictedContributionsCount: number;
        contributionCalendar: {
          totalContributions: number;
          weeks: Array<{
            contributionDays: GitHubContributionDay[];
          }>;
        };
      };
      repositoriesContributedTo?: {
        totalCount: number;
      };
    } | null;
  };
  errors?: Array<{ message: string }>;
};

function getContributionGitHubToken(storedUserToken: string | null) {
  try {
    const userToken = decryptGithubToken(storedUserToken);
    if (userToken) return userToken;
  } catch (error) {
    console.warn("[contributions] Could not decrypt user GitHub token", { error });
  }

  return getAppGitHubToken();
}

export async function fetchGitHubContributionStats(user: GitHubUser) {
  const token = getContributionGitHubToken(user.githubToken);
  if (!token) return null;

  const to = new Date();
  const from = new Date(to);
  from.setUTCFullYear(from.getUTCFullYear() - 1);

  try {
    const response = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `
          query UserContributionStats($login: String!, $from: DateTime!, $to: DateTime!) {
            user(login: $login) {
              contributionsCollection(from: $from, to: $to) {
                totalCommitContributions
                totalIssueContributions
                totalPullRequestContributions
                totalPullRequestReviewContributions
                restrictedContributionsCount
                contributionCalendar {
                  totalContributions
                  weeks {
                    contributionDays {
                      date
                      contributionCount
                    }
                  }
                }
              }
              repositoriesContributedTo(
                first: 1
                contributionTypes: [COMMIT, ISSUE, PULL_REQUEST, PULL_REQUEST_REVIEW]
              ) {
                totalCount
              }
            }
          }
        `,
        variables: {
          login: user.username,
          from: from.toISOString(),
          to: to.toISOString(),
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`GitHub GraphQL failed: ${response.status}`);
    }

    const payload = (await response.json()) as GitHubGraphQlResponse;
    if (payload.errors?.length) {
      throw new Error(payload.errors.map((error) => error.message).join("; "));
    }

    const collection = payload.data?.user?.contributionsCollection;
    if (!collection) return null;

    const contributionDays = collection.contributionCalendar.weeks.flatMap((week) =>
      week.contributionDays
    );

    return {
      commits: collection.totalCommitContributions,
      issues: collection.totalIssueContributions,
      pullRequests: collection.totalPullRequestContributions,
      reviews: collection.totalPullRequestReviewContributions,
      restricted: collection.restrictedContributionsCount,
      totalContributions: collection.contributionCalendar.totalContributions,
      repositoriesContributedTo: payload.data?.user?.repositoriesContributedTo?.totalCount ?? 0,
      contributionDays,
      contributionDates: contributionDays
        .filter((day) => day.contributionCount > 0)
        .map((day) => day.date),
    } satisfies GitHubContributionStats;
  } catch (error) {
    console.error("[contributions] Failed to fetch GitHub contribution stats", {
      userId: user.id,
      username: user.username,
      error,
    });
    return null;
  }
}
