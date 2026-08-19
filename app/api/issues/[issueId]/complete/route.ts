import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentDbUser } from "@/lib/auth-user";
import { recordMergedContribution } from "@/lib/contributions";
import { decryptGithubToken } from "@/lib/github-token";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const completeIssueSchema = z.object({
  prUrl: z.string().trim().min(1, "PR URL is required"),
});

type GitHubPullRequestResponse = {
  html_url?: string;
  merged?: boolean;
  merged_at?: string | null;
  number?: number;
  title?: string;
  user?: {
    id?: number;
  } | null;
};

export function parseGitHubPullRequestUrl(prUrl: string) {
  let url: URL;

  try {
    url = new URL(prUrl);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com") {
    return null;
  }

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length !== 4 || parts[2] !== "pull") {
    return null;
  }

  const prNumber = Number.parseInt(parts[3], 10);
  if (!Number.isInteger(prNumber) || prNumber <= 0 || String(prNumber) !== parts[3]) {
    return null;
  }

  return {
    owner: parts[0],
    repo: parts[1],
    prNumber,
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ issueId: string }> }
) {
  const user = await getCurrentDbUser({
    id: true,
    githubId: true,
    githubToken: true,
  });

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { issueId } = await params;
  const workingOn = await prisma.workingOn.findUnique({
    where: {
      userId_issueId: {
        userId: user.id,
        issueId,
      },
    },
    select: { id: true },
  });

  if (!workingOn) {
    return NextResponse.json(
      { error: "You are not working on this issue." },
      { status: 404 }
    );
  }

  const parsedBody = completeIssueSchema.safeParse(await request.json());
  if (!parsedBody.success) {
    return NextResponse.json({ error: z.treeifyError(parsedBody.error) }, { status: 400 });
  }

  const parsedUrl = parseGitHubPullRequestUrl(parsedBody.data.prUrl);
  if (!parsedUrl) {
    return NextResponse.json(
      { error: "Enter a valid GitHub pull request URL." },
      { status: 400 }
    );
  }

  let githubToken: string | null = null;
  try {
    githubToken = decryptGithubToken(user.githubToken);
  } catch (error) {
    console.error("[issue-complete] Failed to decrypt GitHub token", {
      userId: user.id,
      error,
    });
  }

  if (!githubToken) {
    return NextResponse.json(
      { error: "No GitHub token found. Please re-authenticate." },
      { status: 400 }
    );
  }

  const response = await fetch(
    `https://api.github.com/repos/${parsedUrl.owner}/${parsedUrl.repo}/pulls/${parsedUrl.prNumber}`,
    {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    }
  );

  if (response.status === 404) {
    return NextResponse.json({ error: "This PR could not be found." }, { status: 404 });
  }

  if (!response.ok) {
    return NextResponse.json(
      { error: `GitHub could not verify this PR (${response.status}).` },
      { status: 502 }
    );
  }

  const pullRequest = (await response.json()) as GitHubPullRequestResponse;

  if (pullRequest.merged !== true || !pullRequest.merged_at) {
    return NextResponse.json({ error: "This PR isn't merged yet." }, { status: 400 });
  }

  if (pullRequest.user?.id !== user.githubId) {
    return NextResponse.json(
      { error: "This PR wasn't submitted by you." },
      { status: 403 }
    );
  }

  const contribution = await recordMergedContribution({
    userId: user.id,
    repoOwner: parsedUrl.owner,
    repoName: parsedUrl.repo,
    prNumber: parsedUrl.prNumber,
    prTitle: pullRequest.title ?? `Pull request #${parsedUrl.prNumber}`,
    prUrl: pullRequest.html_url ?? parsedBody.data.prUrl,
    mergedAt: new Date(pullRequest.merged_at),
    logContext: "issue-complete",
  });

  await prisma.workingOn.delete({
    where: { id: workingOn.id },
  });

  return NextResponse.json({ contribution });
}
