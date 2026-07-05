import { cache } from "react";
import { getCachedJson, setCachedJson } from "@/lib/cache";
import { getLocalContributionHeatmap } from "@/lib/contribution-activity";
import { decryptGithubToken, getAppGitHubToken } from "@/lib/github-token";
import { prisma } from "@/lib/prisma";

type GitHubProfile = {
  login?: string;
  name?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  location?: string | null;
  created_at?: string;
};

type GitHubOverview = {
  profile: {
    login: string;
    name: string | null;
    avatarUrl: string | null;
    bio: string | null;
    location: string | null;
    createdAt: string | null;
  } | null;
  stats: {
    commits: number;
    pullRequests: number;
    totalContributions: number;
    repositoriesContributedTo: number;
  } | null;
  contributionDays: Array<{ date: string; contributionCount: number }>;
  repositories: Array<{
    owner: string;
    name: string;
    fullName: string;
    stars: number;
    url: string;
  }>;
  pullRequests: Array<{
    repoOwner: string;
    repoName: string;
    prNumber: number;
    prTitle: string;
    prUrl: string;
    mergedAt: Date;
  }>;
};

type GitHubOverviewResponse = {
  data?: {
    user?: {
      login: string;
      name: string | null;
      avatarUrl: string | null;
      bio: string | null;
      location: string | null;
      createdAt: string;
      contributionsCollection?: {
        totalCommitContributions: number;
        totalPullRequestContributions: number;
        contributionCalendar: {
          totalContributions: number;
          weeks: Array<{
            contributionDays: Array<{ date: string; contributionCount: number }>;
          }>;
        };
      };
      repositoriesContributedTo?: {
        totalCount: number;
        nodes: Array<{
          name: string;
          nameWithOwner: string;
          stargazerCount: number;
          url: string;
          owner: { login: string };
        } | null>;
      };
      pullRequests?: {
        nodes: Array<{
          number: number;
          title: string;
          url: string;
          mergedAt: string | null;
          repository: {
            name: string;
            owner: { login: string };
          };
        } | null>;
      };
    } | null;
  };
  errors?: Array<{ message: string }>;
};

export type PublicProfilePayload = {
  user: {
    username: string;
    name: string | null;
    avatarUrl: string | null;
    bio: string | null;
    location: string | null;
    createdAt: Date | string;
  };
  topSkills: Array<{
    id: string;
    name: string;
    level: "strong" | "moderate" | "learning";
    confidence: number;
    repoCount: number;
    commitCount: number;
  }>;
  topContributions: Array<{
    id: string;
    repoOwner: string;
    repoName: string;
    prNumber: number;
    prTitle: string;
    prUrl: string;
    mergedAt: Date;
    aiDescription: string | null;
    skillsDemonstrated: string[];
    complexity: number | null;
    linesAdded: number | null;
    linesRemoved: number | null;
    filesChanged: number | null;
  }>;
  skillSnapshots: Array<{
    id: string;
    snapshot: unknown;
    takenAt: Date;
  }>;
  heatmap: Array<{
    date: string;
    count: number;
    avgComplexity: number;
    snippet: string | null;
    source: "github" | "local";
  }>;
  contributedRepos: Array<{
    id: string | null;
    owner: string;
    name: string;
    fullName: string;
    stars: number;
    url?: string;
  }>;
  stats: {
    totalPRs: number;
    totalRepos: number;
    totalReach: number;
    totalCommits: number;
    totalContributions: number;
  };
};

function getProfileGitHubToken(storedToken: string | null) {
  try {
    return decryptGithubToken(storedToken) ?? getAppGitHubToken();
  } catch {
    return getAppGitHubToken();
  }
}

async function fetchGitHubProfile(username: string, storedToken: string | null) {
  const token = getProfileGitHubToken(storedToken);
  if (!token) return null;

  try {
    const response = await fetch(`https://api.github.com/users/${username}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      next: { revalidate: 600 },
    });

    if (!response.ok) return null;
    return (await response.json()) as GitHubProfile;
  } catch {
    return null;
  }
}

async function fetchGitHubOverview(username: string, storedToken: string | null) {
  const token = getProfileGitHubToken(storedToken);
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
          query PublicProfileOverview($login: String!, $from: DateTime!, $to: DateTime!) {
            user(login: $login) {
              login
              name
              avatarUrl
              bio
              location
              createdAt
              contributionsCollection(from: $from, to: $to) {
                totalCommitContributions
                totalPullRequestContributions
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
                first: 50
                contributionTypes: [COMMIT, ISSUE, PULL_REQUEST, PULL_REQUEST_REVIEW]
                includeUserRepositories: false
                orderBy: { field: STARGAZERS, direction: DESC }
              ) {
                totalCount
                nodes {
                  name
                  nameWithOwner
                  stargazerCount
                  url
                  owner {
                    login
                  }
                }
              }
              pullRequests(first: 50, states: MERGED, orderBy: { field: UPDATED_AT, direction: DESC }) {
                nodes {
                  number
                  title
                  url
                  mergedAt
                  repository {
                    name
                    owner {
                      login
                    }
                  }
                }
              }
            }
          }
        `,
        variables: {
          login: username,
          from: from.toISOString(),
          to: to.toISOString(),
        },
      }),
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as GitHubOverviewResponse;
    if (payload.errors?.length) {
      console.warn("[profile] GitHub profile GraphQL returned errors", {
        username,
        errors: payload.errors,
      });
      return null;
    }

    const user = payload.data?.user;
    if (!user) return null;

    return {
      profile: {
        login: user.login,
        name: user.name,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
        location: user.location,
        createdAt: user.createdAt,
      },
      stats: user.contributionsCollection
        ? {
            commits: user.contributionsCollection.totalCommitContributions,
            pullRequests: user.contributionsCollection.totalPullRequestContributions,
            totalContributions:
              user.contributionsCollection.contributionCalendar.totalContributions,
            repositoriesContributedTo: user.repositoriesContributedTo?.totalCount ?? 0,
          }
        : null,
      contributionDays:
        user.contributionsCollection?.contributionCalendar.weeks.flatMap(
          (week) => week.contributionDays
        ) ?? [],
      repositories:
        user.repositoriesContributedTo?.nodes
          .filter((repo): repo is NonNullable<typeof repo> => Boolean(repo))
          .map((repo) => ({
            owner: repo.owner.login,
            name: repo.name,
            fullName: repo.nameWithOwner,
            stars: repo.stargazerCount,
            url: repo.url,
          })) ?? [],
      pullRequests:
        user.pullRequests?.nodes
          .filter((pr): pr is NonNullable<typeof pr> => Boolean(pr?.mergedAt))
          .map((pr) => ({
            repoOwner: pr.repository.owner.login,
            repoName: pr.repository.name,
            prNumber: pr.number,
            prTitle: pr.title,
            prUrl: pr.url,
            mergedAt: new Date(pr.mergedAt as string),
          })) ?? [],
    } satisfies GitHubOverview;
  } catch (error) {
    console.warn("[profile] Failed to fetch GitHub profile overview", { username, error });
    return null;
  }
}

function buildGitHubHeatmap(
  githubOverview: GitHubOverview | null,
  localHeatmap: Awaited<ReturnType<typeof getLocalContributionHeatmap>>
) {
  if (!githubOverview || githubOverview.contributionDays.length === 0) {
    return localHeatmap;
  }

  const localByDate = new Map(localHeatmap.map((cell) => [cell.date, cell]));

  return githubOverview.contributionDays
    .filter((day) => day.contributionCount > 0)
    .map((day) => {
      const local = localByDate.get(day.date);
      return {
        date: day.date,
        count: day.contributionCount,
        avgComplexity: local?.avgComplexity ?? Math.min(4, Math.max(1, day.contributionCount)),
        snippet: local?.snippet ?? "GitHub contribution activity",
        source: "github" as const,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export const getPublicProfile = cache(
  async (username: string): Promise<PublicProfilePayload | null> => {
    const cacheKey = `profile:${username.toLowerCase()}:v3`;
    const cached = await getCachedJson<PublicProfilePayload>(cacheKey, "profile");
    if (cached) return cached;

    const user = await prisma.user.findFirst({
      where: { username: { equals: username, mode: "insensitive" }, onboarded: true },
      select: {
        id: true,
        username: true,
        name: true,
        avatarUrl: true,
        githubToken: true,
        createdAt: true,
        skillProfile: {
          select: {
            totalCommits: true,
            totalRepos: true,
            mergedPRs: true,
            skills: {
              orderBy: [{ confidence: "desc" }, { repoCount: "desc" }],
              take: 6,
              select: {
                id: true,
                name: true,
                level: true,
                confidence: true,
                repoCount: true,
                commitCount: true,
              },
            },
          },
        },
        contributions: {
          where: { processed: true },
          orderBy: [{ complexity: "desc" }, { mergedAt: "desc" }],
          take: 5,
          select: {
            id: true,
            repoOwner: true,
            repoName: true,
            prNumber: true,
            prTitle: true,
            prUrl: true,
            mergedAt: true,
            aiDescription: true,
            skillsDemonstrated: true,
            complexity: true,
            linesAdded: true,
            linesRemoved: true,
            filesChanged: true,
          },
        },
        skillSnapshots: {
          orderBy: { takenAt: "asc" },
          select: { id: true, snapshot: true, takenAt: true },
        },
      },
    });

    if (!user) return null;

    const [githubProfile, githubOverview, localHeatmap, allContributions] = await Promise.all([
      fetchGitHubProfile(user.username, user.githubToken),
      fetchGitHubOverview(user.username, user.githubToken),
      getLocalContributionHeatmap(user.id),
      prisma.contribution.findMany({
        where: { userId: user.id },
        select: {
          id: true,
          repoOwner: true,
          repoName: true,
          prNumber: true,
          prTitle: true,
          prUrl: true,
          mergedAt: true,
          aiDescription: true,
          skillsDemonstrated: true,
          complexity: true,
          linesAdded: true,
          linesRemoved: true,
          filesChanged: true,
        },
      }),
    ]);

    const profileLogin =
      githubOverview?.profile?.login ?? githubProfile?.login ?? user.username;
    const isExternalRepo = (owner: string) =>
      owner.toLowerCase() !== profileLogin.toLowerCase();
    const externalContributions = allContributions.filter((contribution) =>
      isExternalRepo(contribution.repoOwner)
    );
    const localContributionByKey = new Map(
      externalContributions.map((contribution) => [
        `${contribution.repoOwner}/${contribution.repoName}#${contribution.prNumber}`.toLowerCase(),
        contribution,
      ])
    );
    const githubTopContributions = (githubOverview?.pullRequests ?? [])
      .filter((pr) => isExternalRepo(pr.repoOwner))
      .map((pr) => {
        const local = localContributionByKey.get(
          `${pr.repoOwner}/${pr.repoName}#${pr.prNumber}`.toLowerCase()
        );

        return {
          id: local?.id ?? `github:${pr.repoOwner}/${pr.repoName}#${pr.prNumber}`,
          repoOwner: pr.repoOwner,
          repoName: pr.repoName,
          prNumber: pr.prNumber,
          prTitle: local?.prTitle ?? pr.prTitle,
          prUrl: local?.prUrl ?? pr.prUrl,
          mergedAt: local?.mergedAt ?? pr.mergedAt,
          aiDescription: local?.aiDescription ?? null,
          skillsDemonstrated: local?.skillsDemonstrated ?? [],
          complexity: local?.complexity ?? null,
          linesAdded: local?.linesAdded ?? null,
          linesRemoved: local?.linesRemoved ?? null,
          filesChanged: local?.filesChanged ?? null,
        };
      });
    const localTopContributions = [...externalContributions].sort((a, b) => {
      const complexityDiff = (b.complexity ?? 0) - (a.complexity ?? 0);
      if (complexityDiff !== 0) return complexityDiff;
      return b.mergedAt.getTime() - a.mergedAt.getTime();
    });
    const topContributions =
      githubTopContributions.length > 0
        ? githubTopContributions.slice(0, 5)
        : localTopContributions.slice(0, 5);
    const localRepoPairs = externalContributions.map(
      (item) => `${item.repoOwner}/${item.repoName}`
    );
    const githubRepos = (githubOverview?.repositories ?? []).filter((repo) =>
      isExternalRepo(repo.owner)
    );
    const repoPairs = Array.from(
      new Set([...githubRepos.map((repo) => repo.fullName), ...localRepoPairs])
    );
    const githubRepoByFullName = new Map(
      githubRepos.map((repo) => [repo.fullName.toLowerCase(), repo])
    );
    const contributedRepos = repoPairs.map((fullName) => {
      const githubRepo = githubRepoByFullName.get(fullName.toLowerCase());
      if (githubRepo) {
        return { id: null, ...githubRepo };
      }

      const [owner, name] = fullName.split("/");
      return { id: null, owner, name, fullName, stars: 0, url: `https://github.com/${fullName}` };
    });
    const totalReach = contributedRepos.reduce((sum, repo) => sum + repo.stars, 0);
    const heatmap = buildGitHubHeatmap(githubOverview, localHeatmap);

    const payload = {
      user: {
        username: profileLogin,
        name: githubOverview?.profile?.name ?? githubProfile?.name ?? user.name,
        avatarUrl:
          githubOverview?.profile?.avatarUrl ?? githubProfile?.avatar_url ?? user.avatarUrl,
        bio: githubOverview?.profile?.bio ?? githubProfile?.bio ?? null,
        location: githubOverview?.profile?.location ?? githubProfile?.location ?? null,
        createdAt:
          githubOverview?.profile?.createdAt ?? githubProfile?.created_at ?? user.createdAt,
      },
      topSkills: user.skillProfile?.skills ?? [],
      topContributions,
      skillSnapshots: user.skillSnapshots,
      heatmap,
      contributedRepos,
      stats: {
        totalPRs: Math.max(externalContributions.length, githubTopContributions.length),
        totalRepos: contributedRepos.length,
        totalReach,
        totalCommits: Math.max(
          user.skillProfile?.totalCommits ?? 0,
          githubOverview?.stats?.commits ?? 0
        ),
        totalContributions:
          githubOverview?.stats?.totalContributions ?? heatmap.reduce((sum, cell) => sum + cell.count, 0),
      },
    };

    await setCachedJson(cacheKey, payload, 60 * 10, "profile");
    return payload satisfies PublicProfilePayload;
  }
);
