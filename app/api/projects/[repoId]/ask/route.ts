import { ChatGroq } from "@langchain/groq";
import { tool } from "@langchain/core/tools";
import { createAgent } from "langchain";
import { NextResponse } from "next/server";
import { z } from "zod";
import { embed } from "@/lib/embeddings";
import { GROQ_MODEL } from "@/lib/groq";
import { prisma } from "@/lib/prisma";
import { getProjectStats } from "@/lib/project-intelligence";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const askSchema = z.object({
  query: z.string().trim().min(1),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .optional(),
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

function toVectorLiteral(values: number[]) {
  return `[${values.join(",")}]`;
}

type ProjectAskRepo = {
  id: string;
  owner: string;
  name: string;
};

function buildProjectTools(repo: ProjectAskRepo) {
  const searchDocs = tool(
    async ({ query }) => {
      const queryVector = toVectorLiteral(await embed(query));
      const sourceRows = await prisma.$queryRaw<Array<{ chunkText: string }>>`
        SELECT "chunkText"
        FROM repo_docs
        WHERE "repoId" = ${repo.id}
        ORDER BY embedding <=> ${queryVector}::vector
        LIMIT 4
      `;

      if (sourceRows.length === 0) {
        return "No README.md or CONTRIBUTING.md chunks are indexed for this repo yet.";
      }

      return sourceRows
        .map((row, index) => `Chunk ${index + 1}:\n${row.chunkText}`)
        .join("\n\n---\n\n");
    },
    {
      name: "search_docs",
      description:
        "Search this repository's indexed README.md and CONTRIBUTING.md chunks for setup, architecture, conventions, and contribution docs.",
      schema: z.object({
        query: z.string().describe("The documentation search query."),
      }),
    }
  );

  const getOpenIssues = tool(
    async ({ repoId }) => {
      if (repoId !== repo.id) {
        return `This tool is scoped to repoId ${repo.id}.`;
      }

      const issues = await prisma.issue.findMany({
        where: { repoId, state: "open", classified: true },
        orderBy: { updatedAt: "desc" },
        take: 10,
        select: {
          title: true,
          difficulty: true,
          issueType: true,
          aiSummary: true,
        },
      });

      if (issues.length === 0) {
        return "No classified open issues are available for this repo yet.";
      }

      return JSON.stringify({ repoId, issues });
    },
    {
      name: "get_open_issues",
      description:
        "Get up to 10 classified open issues for this repository, including title, difficulty, issue type, and AI summary.",
      schema: z.object({
        repoId: z.string().describe("The repository id to fetch issues for."),
      }),
    }
  );

  const getRepoStats = tool(
    async ({ repoId }) => {
      if (repoId !== repo.id) {
        return `This tool is scoped to repoId ${repo.id}.`;
      }

      const stats = await getProjectStats(repoId);
      if (!stats) {
        return "No project intelligence stats are available for this repo.";
      }

      return JSON.stringify(stats);
    },
    {
      name: "get_repo_stats",
      description:
        "Get project intelligence stats for this repository: activity score, maintainer score, and classified open issue type breakdown.",
      schema: z.object({
        repoId: z.string().describe("The repository id to fetch stats for."),
      }),
    }
  );

  return [searchDocs, getOpenIssues, getRepoStats];
}

function buildAgentMessages({
  history,
  query,
  repo,
}: {
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  query: string;
  repo: ProjectAskRepo;
}) {
  return [
    ...(history ?? []).map((message) => ({
      role: message.role,
      content: message.content,
    })),
    {
      role: "user" as const,
      content: `Repo: ${repo.owner}/${repo.name}\nrepoId: ${repo.id}\n\nQuestion: ${query}`,
    },
  ];
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
    },
  });

  if (!repo) {
    return NextResponse.json({ error: "Repo not found" }, { status: 404 });
  }

  const model = new ChatGroq({
    model: GROQ_MODEL,
    temperature: 0.1,
    maxTokens: 500,
    streaming: true,
  });

  const agent = createAgent({
    model,
    tools: buildProjectTools(repo),
    systemPrompt:
      "You help contributors understand this repo. Use search_docs for setup/architecture/convention questions, get_open_issues for questions about available work, get_repo_stats for health/activity questions. Only answer from tool results - if none of the tools return relevant info, say so explicitly. You may call more than one tool if the question needs it.",
  });

  const agentMessages = buildAgentMessages({
    history: parsed.data.messages,
    query: parsed.data.query,
    repo,
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const run = await agent.streamEvents(
          { messages: agentMessages },
          { version: "v3", recursionLimit: 8 }
        );

        for await (const message of run.messages) {
          for await (const token of message.text) {
            if (token) {
              controller.enqueue(encoder.encode(token));
            }
          }
        }

        await run.output;
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
