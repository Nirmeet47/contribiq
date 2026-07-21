import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentAuthUser } from "@/lib/auth-user";
import { prisma } from "@/lib/prisma";
import {
  checkRateLimit,
  getRateLimitStatus,
  rateLimitHeaders,
  type RateLimitResult,
  scopedRateLimitHeaders,
} from "@/lib/rate-limit";

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

const ASK_RATE_LIMIT = {
  perMinute: {
    limit: 5,
    windowSeconds: 60,
  },
  perHour: {
    limit: 30,
    windowSeconds: 60 * 60,
  },
};

function askMinuteKey(userId: string) {
  return `web-ask:${userId}`;
}

function askHourKey(userId: string) {
  return `web-ask-hour:${userId}`;
}

function askRateLimitHeaders(minute: RateLimitResult, hour: RateLimitResult) {
  return {
    ...rateLimitHeaders(minute),
    ...scopedRateLimitHeaders("Minute", minute),
    ...scopedRateLimitHeaders("Hour", hour),
  };
}

function getAiApiBaseUrl() {
  return process.env.AI_API_BASE_URL ?? "http://127.0.0.1:8001";
}

async function postToAiProjectAsk(
  projectId: string,
  userId: string,
  payload: {
    question?: string;
    query?: string;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
    messages?: Array<{ role: "user" | "assistant"; content: string }>;
  }
) {
  return fetch(`${getAiApiBaseUrl()}/projects/${projectId}/ask`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-ContribIQ-User-Id": userId,
    },
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

async function getAskRateLimitStatus(userId: string) {
  const [minute, hour] = await Promise.all([
    getRateLimitStatus({
      key: askMinuteKey(userId),
      limit: ASK_RATE_LIMIT.perMinute.limit,
      windowSeconds: ASK_RATE_LIMIT.perMinute.windowSeconds,
    }),
    getRateLimitStatus({
      key: askHourKey(userId),
      limit: ASK_RATE_LIMIT.perHour.limit,
      windowSeconds: ASK_RATE_LIMIT.perHour.windowSeconds,
    }),
  ]);

  return { minute, hour };
}

export async function GET() {
  const user = await getCurrentAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { minute, hour } = await getAskRateLimitStatus(user.id);

  return NextResponse.json(
    {
      minute: {
        remaining: minute.remaining,
        limit: minute.limit,
        resetSeconds: minute.retryAfterSeconds,
      },
      hour: {
        remaining: hour.remaining,
        limit: hour.limit,
        resetSeconds: hour.retryAfterSeconds,
      },
    },
    {
      headers: askRateLimitHeaders(minute, hour),
    }
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await getCurrentAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const currentStatus = await getAskRateLimitStatus(user.id);
  if (!currentStatus.minute.allowed) {
    return NextResponse.json(
      { error: `Too many requests, try again in ${currentStatus.minute.retryAfterSeconds} seconds` },
      {
        status: 429,
        headers: askRateLimitHeaders(currentStatus.minute, currentStatus.hour),
      }
    );
  }

  if (!currentStatus.hour.allowed) {
    return NextResponse.json(
      { error: `Too many requests, try again in ${currentStatus.hour.retryAfterSeconds} seconds` },
      {
        status: 429,
        headers: askRateLimitHeaders(currentStatus.minute, currentStatus.hour),
      }
    );
  }

  const rateLimit = await checkRateLimit({
    key: askMinuteKey(user.id),
    limit: ASK_RATE_LIMIT.perMinute.limit,
    windowSeconds: ASK_RATE_LIMIT.perMinute.windowSeconds,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: `Too many requests, try again in ${rateLimit.retryAfterSeconds} seconds` },
      {
        status: 429,
        headers: askRateLimitHeaders(rateLimit, currentStatus.hour),
      }
    );
  }

  const checkedHourlyRateLimit = await checkRateLimit({
    key: askHourKey(user.id),
    limit: ASK_RATE_LIMIT.perHour.limit,
    windowSeconds: ASK_RATE_LIMIT.perHour.windowSeconds,
  });

  if (!checkedHourlyRateLimit.allowed) {
    return NextResponse.json(
      { error: `Too many requests, try again in ${checkedHourlyRateLimit.retryAfterSeconds} seconds` },
      {
        status: 429,
        headers: askRateLimitHeaders(rateLimit, checkedHourlyRateLimit),
      }
    );
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
    response = await postToAiProjectAsk(projectId, user.id, {
      question,
      history,
    });

    if (response.status === 422) {
      response = await postToAiProjectAsk(projectId, user.id, {
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
      ...askRateLimitHeaders(rateLimit, checkedHourlyRateLimit),
    },
  });
}
