import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { contributionQueue } from "@/lib/queues";
import { prisma } from "@/lib/prisma";

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

export async function POST(request: Request) {
  const rawBody = await request.text();

  if (!isValidSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody);
  const event = request.headers.get("x-github-event");

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

  await contributionQueue.add("process-contribution", {
    contributionId: contribution.id,
  });

  return NextResponse.json({ ok: true });
}
