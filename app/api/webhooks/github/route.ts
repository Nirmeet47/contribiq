import { NextResponse } from "next/server";
import { processContributionWithAi } from "@/lib/contribution-ai";
import { invalidateContributionStats } from "@/lib/contribution-cache";
import { invalidateAllFeedCaches } from "@/lib/feed-cache";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { isValidSignature } from "@/lib/webhook-signature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function issueStateForAction(action: string) {
  if (action === "closed" || action === "deleted" || action === "transferred") {
    return "closed" as const;
  }

  if (action === "reopened" || action === "opened") {
    return "open" as const;
  }

  return null;
}

type GitHubWebhookPayload = {
  action?: unknown;
  repository?: {
    owner?: { login?: unknown };
    name?: unknown;
  };
  issue?: {
    id?: unknown;
    number?: unknown;
    title?: unknown;
    body?: unknown;
    labels?: unknown;
    assignees?: unknown;
    comments?: unknown;
    html_url?: unknown;
  };
  pull_request?: {
    merged?: unknown;
    number?: unknown;
    title?: unknown;
    html_url?: unknown;
    merged_at?: unknown;
    user?: { id?: unknown };
  };
};

function issueLabelNames(labels: unknown) {
  if (!Array.isArray(labels)) return undefined;

  return labels
    .map((label) =>
      typeof label === "object" &&
      label !== null &&
      "name" in label &&
      typeof label.name === "string"
        ? label.name
        : null
    )
    .filter((name): name is string => Boolean(name));
}

async function syncIssueState(payload: GitHubWebhookPayload) {
  const nextState = issueStateForAction(String(payload.action ?? ""));
  if (!nextState) return;

  const repoOwner = payload.repository?.owner?.login;
  const repoName = payload.repository?.name;
  const issue = payload.issue;
  const githubIssueId = typeof issue?.id === "number" ? issue.id : null;
  const issueNumber = typeof issue?.number === "number" ? issue.number : null;

  if (!repoOwner || !repoName || (!githubIssueId && !issueNumber)) return;

  const repo = await prisma.repo.findFirst({
    where: { owner: repoOwner, name: repoName },
    select: { id: true },
  });

  if (!repo) return;

  const existingIssue = await prisma.issue.findFirst({
    where: {
      repoId: repo.id,
      OR: [
        ...(githubIssueId ? [{ githubId: githubIssueId }] : []),
        ...(issueNumber ? [{ githubUrl: { endsWith: `/issues/${issueNumber}` } }] : []),
      ],
    },
    select: { id: true },
  });

  if (!existingIssue) return;

  await prisma.issue.update({
    where: { id: existingIssue.id },
    data: {
      state: nextState,
      title: typeof issue?.title === "string" ? issue.title : undefined,
      body: typeof issue?.body === "string" || issue?.body === null ? issue.body : undefined,
      labels: issueLabelNames(issue?.labels),
      assigneeCount: Array.isArray(issue?.assignees) ? issue.assignees.length : undefined,
      commentCount: typeof issue?.comments === "number" ? issue.comments : undefined,
      githubUrl: typeof issue?.html_url === "string" ? issue.html_url : undefined,
    },
  });

  try {
    await redis.del(`issue:${existingIssue.id}`);
    await redis.del(`project:${repo.id}`);
    await invalidateAllFeedCaches(`github-issue-${payload.action}`);
  } catch (error) {
    console.error("[webhook] Failed to invalidate issue/feed caches", {
      issueId: existingIssue.id,
      repoId: repo.id,
      action: payload.action,
      error,
    });
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  if (
    !isValidSignature(
      rawBody,
      request.headers.get("x-hub-signature-256"),
      process.env.GITHUB_WEBHOOK_SECRET
    )
  ) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody) as GitHubWebhookPayload;
  const event = request.headers.get("x-github-event");

  if (event === "issues") {
    await syncIssueState(payload);
    return NextResponse.json({ ok: true });
  }

  if (
    event !== "pull_request" ||
    payload.action !== "closed" ||
    payload.pull_request?.merged !== true
  ) {
    return NextResponse.json({ ok: true });
  }

  const pullRequest = payload.pull_request;
  const repoOwner = payload.repository?.owner?.login;
  const repoName = payload.repository?.name;
  const prNumber = pullRequest.number;
  const prTitle = pullRequest.title;
  const prUrl = pullRequest.html_url;
  const mergedAtValue = pullRequest.merged_at;
  const githubUserId = pullRequest.user?.id;

  if (
    typeof repoOwner !== "string" ||
    typeof repoName !== "string" ||
    typeof prNumber !== "number" ||
    typeof prTitle !== "string" ||
    typeof prUrl !== "string" ||
    typeof mergedAtValue !== "string" ||
    typeof githubUserId !== "number"
  ) {
    return NextResponse.json({ error: "Invalid pull request payload" }, { status: 400 });
  }

  const mergedAt = new Date(mergedAtValue);

  const user = await prisma.user.findFirst({
    where: { githubId: githubUserId },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json({ ok: true });
  }

  const contribution = await prisma.contribution.upsert({
    where: {
      userId_repoOwner_repoName_prNumber: {
        userId: user.id,
        repoOwner,
        repoName,
        prNumber,
      },
    },
    update: {
      prTitle,
      prUrl,
      mergedAt,
      processed: false,
    },
    create: {
      userId: user.id,
      repoOwner,
      repoName,
      prNumber,
      prTitle,
      prUrl,
      mergedAt,
      processed: false,
    },
  });

  await invalidateContributionStats(user.id);

  processContributionWithAi(contribution.id).catch((error) => {
    console.error("[webhook] Failed to trigger Python contribution processing", {
      contributionId: contribution.id,
      error,
    });
  });

  return NextResponse.json({ ok: true });
}
