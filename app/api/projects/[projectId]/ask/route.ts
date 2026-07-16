import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentDbUserId } from "@/lib/auth-user";
import { prisma } from "@/lib/prisma";

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

function getAiApiBaseUrl() {
  return process.env.AI_API_BASE_URL ?? "http://127.0.0.1:8001";
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

  const { projectId } = await params;
  const repo = await prisma.repo.findUnique({
    where: { id: projectId },
    select: { id: true },
  });

  if (!repo) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const response = await fetch(`${getAiApiBaseUrl()}/projects/${projectId}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed.data),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return NextResponse.json(
      { error: errorText || "Python AI service failed" },
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
