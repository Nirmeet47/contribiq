import "dotenv/config";

import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { Worker, type ConnectionOptions } from "bullmq";
import { z } from "zod";
import { embed } from "@/lib/embeddings";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

const connection = redis as unknown as ConnectionOptions;

const DOC_PATHS = ["README.md", "CONTRIBUTING.md"] as const;
const CHUNK_TOKENS = 500;
const CHUNK_OVERLAP = 50;
const GITHUB_API_VERSION = "2022-11-28";

const jobSchema = z
  .object({
    repoId: z.string().optional(),
  })
  .optional();

type RepoForDocs = {
  id: string;
  owner: string;
  name: string;
  fullName: string;
};

type GitHubContentResponse = {
  content?: string;
};

type FetchDocResult =
  | { status: "found"; text: string; hash: string }
  | { status: "missing" }
  | { status: "failed" };

function getGitHubToken() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN is not set");
  }
  return token;
}

async function fetchDoc(owner: string, repo: string, filePath: string) {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
    {
      headers: {
        Authorization: `Bearer ${getGitHubToken()}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
      },
    }
  );

  if (response.status === 404) return { status: "missing" } satisfies FetchDocResult;
  if (response.status === 403) {
    await new Promise((resolve) => setTimeout(resolve, 60_000));
    return { status: "failed" } satisfies FetchDocResult;
  }
  if (!response.ok) {
    console.warn(
      `[repo-docs] GitHub docs fetch failed for ${owner}/${repo}/${filePath}: ${response.status}`
    );
    return { status: "failed" } satisfies FetchDocResult;
  }

  const payload = (await response.json()) as GitHubContentResponse;
  if (!payload.content) return { status: "missing" } satisfies FetchDocResult;

  const rawContent = Buffer.from(payload.content, "base64");
  return {
    status: "found",
    text: rawContent.toString("utf8"),
    hash: createHash("sha256").update(rawContent).digest("hex"),
  } satisfies FetchDocResult;
}

function chunkDocument(filePath: string, text: string) {
  const words = text.match(/\S+/g) ?? [];
  if (words.length === 0) return [];

  const chunks: string[] = [];
  const step = CHUNK_TOKENS - CHUNK_OVERLAP;

  for (let start = 0; start < words.length; start += step) {
    const segment = words.slice(start, start + CHUNK_TOKENS);
    if (segment.length === 0) break;
    chunks.push(`${filePath}\n\n${segment.join(" ")}`);
    if (start + CHUNK_TOKENS >= words.length) break;
  }

  return chunks;
}

function toVectorLiteral(values: number[]) {
  return `[${values.join(",")}]`;
}

async function existingContentHash(repoId: string, filePath: string) {
  const rows = await prisma.$queryRaw<Array<{ contentHash: string }>>`
    SELECT "contentHash"
    FROM repo_docs
    WHERE "repoId" = ${repoId} AND "filePath" = ${filePath}
    LIMIT 1
  `;

  return rows[0]?.contentHash ?? null;
}

async function deleteDocChunks(repoId: string, filePath: string) {
  await prisma.$executeRaw`
    DELETE FROM repo_docs
    WHERE "repoId" = ${repoId} AND "filePath" = ${filePath}
  `;
}

async function insertDocChunk(args: {
  repoId: string;
  filePath: string;
  hash: string;
  chunkIndex: number;
  chunkText: string;
  embedding: number[];
}) {
  const vector = toVectorLiteral(args.embedding);

  await prisma.$executeRaw`
    INSERT INTO repo_docs (
      id, "repoId", "filePath", "contentHash", "chunkIndex",
      "chunkText", embedding, "updatedAt"
    )
    VALUES (
      gen_random_uuid()::text, ${args.repoId}, ${args.filePath}, ${args.hash}, ${args.chunkIndex},
      ${args.chunkText}, ${vector}::vector, now()
    )
    ON CONFLICT ("repoId", "filePath", "chunkIndex") DO UPDATE SET
      "contentHash" = EXCLUDED."contentHash",
      "chunkText" = EXCLUDED."chunkText",
      embedding = EXCLUDED.embedding,
      "updatedAt" = now()
  `;
}

async function ingestDoc(repo: RepoForDocs, filePath: (typeof DOC_PATHS)[number]) {
  const document = await fetchDoc(repo.owner, repo.name, filePath);

  if (document.status === "failed") {
    return { filePath, changed: false, chunks: 0, missing: false };
  }

  if (document.status === "missing") {
    const existingHash = await existingContentHash(repo.id, filePath);
    if (existingHash) {
      await deleteDocChunks(repo.id, filePath);
      return { filePath, changed: true, chunks: 0, missing: true };
    }

    return { filePath, changed: false, chunks: 0, missing: true };
  }

  const { text, hash } = document;
  if ((await existingContentHash(repo.id, filePath)) === hash) {
    return { filePath, changed: false, chunks: 0, missing: false };
  }

  const chunks = chunkDocument(filePath, text);

  await deleteDocChunks(repo.id, filePath);

  let inserted = 0;
  for (const [chunkIndex, chunkText] of chunks.entries()) {
    const embedding = await embed(chunkText);
    await insertDocChunk({
      repoId: repo.id,
      filePath,
      hash,
      chunkIndex,
      chunkText,
      embedding,
    });
    inserted += 1;
  }

  return { filePath, changed: true, chunks: inserted, missing: false };
}

async function ingestRepo(repo: RepoForDocs) {
  const results = [];

  for (const filePath of DOC_PATHS) {
    results.push(await ingestDoc(repo, filePath));
  }

  return {
    repoId: repo.id,
    fullName: repo.fullName,
    changed: results.some((result) => result.changed),
    chunks: results.reduce((total, result) => total + result.chunks, 0),
    files: results,
  };
}

export const repoDocsIngestWorker = new Worker(
  "repo-docs-ingest",
  async (job) => {
    const data = jobSchema.parse(job.data) ?? {};
    const repos = await prisma.repo.findMany({
      where: data.repoId ? { id: data.repoId } : undefined,
      select: { id: true, owner: true, name: true, fullName: true },
      orderBy: { createdAt: "asc" },
    });

    const results = [];
    for (const repo of repos) {
      results.push(await ingestRepo(repo));
    }

    return {
      repos: repos.length,
      changed: results.filter((result) => result.changed).length,
      chunks: results.reduce((total, result) => total + result.chunks, 0),
      results,
    };
  },
  { connection }
);
