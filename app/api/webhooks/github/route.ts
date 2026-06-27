import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { invalidateContributionStats } from "@/lib/contribution-cache";
import { invalidateAllFeedCaches } from "@/lib/feed-cache";
import { contributionQueue } from "@/lib/queues";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isValidSignature(rawBody: string, signatureHeader: string | null) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret || !signatureHeader?.startsWith("sha256=")) return false;

  const signature = signatureHeader.slice("sha256=".length);
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const signatureBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");

  if (signatureBuffer.length !== expectedBuffer.length) return false;

  return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
}

function issueStateForAction(action: string) {
  if (action === "closed" || action === "deleted" || action === "transferred") {
    return "closed" as const;
  }

  if (action === "reopened" || action === "opened") {
    return "open" as const;
  }

  return null;
}

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

async function syncIssueState(payload: Record<string, any>) {
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

  if (!isValidSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody);
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

  const prNumber = payload.pull_request.number as number;
  const prTitle = payload.pull_request.title as string;
  const prUrl = payload.pull_request.html_url as string;
  const mergedAt = new Date(payload.pull_request.merged_at as string);
  const repoOwner = payload.repository.owner.login as string;
  const repoName = payload.repository.name as string;
  const githubUserId = payload.pull_request.user.id as number;

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

  await contributionQueue.add("process-contribution", {
    contributionId: contribution.id,
  });

  return NextResponse.json({ ok: true });
}
