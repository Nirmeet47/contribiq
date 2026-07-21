// SSE proxy — the next.js app no longer does the AI work itself
// it just forwards the request to the python fastapi agent backend
// and pipes the SSE events straight through to the browser
//
// the agent backend runs at http://localhost:8000 and does the heavy lifting:
// github fetch → groq analysis → postgres write → gemini embedding

import { NextResponse } from "next/server";
import { decryptGithubToken } from "@/lib/github-token";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const ONBOARDING_RATE_LIMIT = {
  limit: 1,
  windowSeconds: 5 * 60,
};

// where the fastapi agent lives
const AGENT_URL = process.env.AGENT_URL || "http://localhost:8000";

export async function GET() {
  // check auth before we do anything
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = await checkRateLimit({
    key: `onboarding:progress:${user.id}`,
    limit: ONBOARDING_RATE_LIMIT.limit,
    windowSeconds: ONBOARDING_RATE_LIMIT.windowSeconds,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: `Too many requests, try again in ${rateLimit.retryAfterSeconds} seconds` },
      {
        status: 429,
        headers: rateLimitHeaders(rateLimit),
      }
    );
  }

  // find the user in our db — the agent needs their id and github token
  const githubIdStr = user.user_metadata?.provider_id;
  const githubId = githubIdStr ? parseInt(githubIdStr, 10) : null;

  if (!githubId) {
    return NextResponse.json({ error: "No GitHub ID found" }, { status: 400 });
  }

  const dbUser = await prisma.user.findUnique({
    where: { githubId },
  });

  if (dbUser?.onboarded) {
    return NextResponse.json(
      { error: "User is already onboarded. Profile generation was not started." },
      { status: 409 }
    );
  }

  if (!dbUser || !dbUser.githubToken) {
    return NextResponse.json(
      { error: "No GitHub token found. Please re-authenticate." },
      { status: 400 }
    );
  }

  let githubToken: string | null = null;
  try {
    githubToken = decryptGithubToken(dbUser.githubToken);
  } catch (error) {
    console.error("[onboarding/progress] Failed to decrypt GitHub token", { error });
    return NextResponse.json(
      { error: "GitHub token could not be decrypted. Please re-authenticate." },
      { status: 400 }
    );
  }

  if (!githubToken) {
    return NextResponse.json(
      { error: "No GitHub token found. Please re-authenticate." },
      { status: 400 }
    );
  }

  // call the fastapi agent and pipe its SSE stream straight to the browser
  try {
    const agentResponse = await fetch(`${AGENT_URL}/agent/profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: dbUser.id,
        github_token: githubToken,
      }),
    });

    if (!agentResponse.ok || !agentResponse.body) {
      const errorText = await agentResponse.text();
      throw new Error(`Agent returned ${agentResponse.status}: ${errorText}`);
    }

    // pipe the stream through — the agent already sends properly formatted SSE events
    return new NextResponse(agentResponse.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err: unknown) {
    // if the agent backend isn't running, give a clear error
    const encoder = new TextEncoder();
    const errorStream = new ReadableStream({
      start(controller) {
        const errorMessage = err instanceof Error ? err.message : "Failed to connect to agent backend";
        console.error("[onboarding/progress]", errorMessage);

        const msg = errorMessage.includes("ECONNREFUSED") || errorMessage.includes("fetch failed")
          ? "Agent backend is not running. Start it with: uvicorn agent.main:app --reload --port 8000"
          : errorMessage;

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ step: "error", message: msg })}\n\n`)
        );
        controller.close();
      },
    });

    return new NextResponse(errorStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }
}
