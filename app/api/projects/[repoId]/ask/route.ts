import { readFile } from "node:fs/promises";
import path from "node:path";
import { IndexFlatIP } from "faiss-node";
import { NextResponse } from "next/server";
import { z } from "zod";
import { embed } from "@/lib/embeddings";
import { groq, GROQ_MODEL } from "@/lib/groq";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const askSchema = z.object({
  query: z.string().trim().min(1),
});

async function getDbUserId() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  const githubIdStr = user.user_metadata?.provider_id;
  if (!githubIdStr) return null;

  const dbUser = await prisma.user.findUnique({
    where: { githubId: parseInt(githubIdStr, 10) },
    select: { id: true },
  });

  return dbUser?.id ?? null;
}

function normalizeVector(vector: number[]) {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) return vector;
  return vector.map((value) => value / norm);
}

function chunksPathForIndex(indexPath: string) {
  return path.join(
    path.dirname(indexPath),
    `${path.basename(indexPath, ".index")}.chunks.json`
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ repoId: string }> }
) {
  const userId = await getDbUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = askSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: z.treeifyError(parsed.error) }, { status: 400 });
  }

  const { repoId } = await params;
  const repo = await prisma.repo.findUnique({
    where: { id: repoId },
    select: {
      id: true,
      owner: true,
      name: true,
      faissIndexPath: true,
    },
  });

  if (!repo) {
    return NextResponse.json({ error: "Repo not found" }, { status: 404 });
  }

  if (!repo.faissIndexPath) {
    return NextResponse.json({ error: "Repo docs index not built yet" }, { status: 400 });
  }

  const chunksPath = chunksPathForIndex(repo.faissIndexPath);
  const [index, chunks] = await Promise.all([
    Promise.resolve(IndexFlatIP.read(repo.faissIndexPath)),
    readFile(chunksPath, "utf-8").then((content) => JSON.parse(content) as string[]),
  ]);

  const queryVector = normalizeVector(await embed(parsed.data.query));
  const result = index.search(queryVector, 4);
  const sourceChunks = result.labels
    .filter((label) => label >= 0 && label < chunks.length)
    .map((label) => chunks[label]);

  const context = sourceChunks
    .map((chunk, index) => `Chunk ${index + 1}:\n${chunk}`)
    .join("\n\n---\n\n");

  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You answer questions using only the provided repository documentation. If the docs do not contain the answer, say that explicitly.",
      },
      {
        role: "user",
        content: `Repo: ${repo.owner}/${repo.name}\nQuestion: ${parsed.data.query}\n\nDocs context:\n${context}`,
      },
    ],
    temperature: 0.1,
    max_tokens: 500,
    stream: true,
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of completion) {
          const token = chunk.choices[0]?.delta?.content;
          if (token) {
            controller.enqueue(encoder.encode(token));
          }
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
