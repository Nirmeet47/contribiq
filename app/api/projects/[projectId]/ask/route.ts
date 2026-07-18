import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentDbUserId } from "@/lib/auth-user";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const askSchema = z.object({
  question: z.string().trim().min(1).optional(),
  query: z.string().trim().min(1).optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .optional(),
});

function getAiApiBaseUrl() {
  return process.env.AI_API_BASE_URL ?? "http://127.0.0.1:8001";
}

async function postToAiProjectAsk(
  projectId: string,
  payload: {
    question?: string;
    query?: string;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
    messages?: Array<{ role: "user" | "assistant"; content: string }>;
  }
) {
  return fetch(`${getAiApiBaseUrl()}/projects/${projectId}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function readAiError(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();

  if (!text) return "Python AI service failed";
  if (!contentType.includes("application/json")) return text;

  try {
    const parsed = JSON.parse(text) as { detail?: unknown; error?: unknown };
    if (typeof parsed.detail === "string") return parsed.detail;
    if (typeof parsed.error === "string") return parsed.error;
    return text;
  } catch {
    return text;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const userId = await getCurrentDbUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = askSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: z.treeifyError(parsed.error) }, { status: 400 });
  }

  const question = parsed.data.question ?? parsed.data.query;
  if (!question) {
    return NextResponse.json({ error: "Question is required" }, { status: 400 });
  }

  const { projectId } = await params;
  const repo = await prisma.repo.findUnique({
    where: { id: projectId },
    select: { id: true },
  });

  if (!repo) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const history = (parsed.data.history ?? parsed.data.messages ?? []).slice(-6);
  let response: Response;
  try {
    response = await postToAiProjectAsk(projectId, {
      question,
      history,
    });

    if (response.status === 422) {
      response = await postToAiProjectAsk(projectId, {
        query: question,
        messages: history,
      });
    }
  } catch {
    return NextResponse.json(
      { error: "Python AI service is not reachable. Start it with npm run ai:api." },
      { status: 502 }
    );
  }

  if (!response.ok) {
    const errorText = await readAiError(response);
    return NextResponse.json(
      { error: errorText },
      { status: response.status }
    );
  }

  return new Response(response.body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
