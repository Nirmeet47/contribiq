"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Clock3, Loader2, MessagesSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetOverlay,
  SheetTitle,
} from "@/components/ui/sheet";
import type { ChatMessage } from "@/components/project/types";

const SUGGESTED_QUESTIONS = [
  "How do I set up locally?",
  "What is the architecture?",
  "What conventions should I follow?",
];

const CHAT_ERROR_PREFIXES = [
  "Python AI service is not reachable",
  "The project docs answer could not be loaded",
  "The project docs answer failed",
  "Python AI service failed",
  "Project docs response did not stream",
];

type RateLimitStatus = {
  minuteRemaining: number;
  minuteLimit: number;
  minuteResetSeconds: number;
  hourRemaining: number;
  hourLimit: number;
  hourResetSeconds: number;
};

type RateLimitUpdate = Partial<RateLimitStatus>;

const DEFAULT_RATE_LIMIT_STATUS: RateLimitStatus = {
  minuteRemaining: 5,
  minuteLimit: 5,
  minuteResetSeconds: 60,
  hourRemaining: 30,
  hourLimit: 30,
  hourResetSeconds: 60 * 60,
};

type RateLimitStatusResponse = {
  minute?: {
    remaining?: number;
    limit?: number;
    resetSeconds?: number;
  };
  hour?: {
    remaining?: number;
    limit?: number;
    resetSeconds?: number;
  };
};

class ProjectAnswerError extends Error {
  rateLimit?: RateLimitUpdate;

  constructor(message: string, rateLimit?: RateLimitUpdate) {
    super(message);
    this.name = "ProjectAnswerError";
    this.rateLimit = rateLimit;
  }
}

function readNumberHeader(headers: Headers, name: string) {
  const value = headers.get(name);
  if (!value) return undefined;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readRateLimitHeaders(headers: Headers): RateLimitUpdate {
  const next: RateLimitUpdate = {};
  const minuteLimit = readNumberHeader(headers, "X-RateLimit-Minute-Limit");
  const minuteRemaining = readNumberHeader(headers, "X-RateLimit-Minute-Remaining");
  const hourLimit = readNumberHeader(headers, "X-RateLimit-Hour-Limit");
  const hourRemaining = readNumberHeader(headers, "X-RateLimit-Hour-Remaining");
  const minuteResetSeconds = readNumberHeader(headers, "X-RateLimit-Minute-Reset");
  const hourResetSeconds = readNumberHeader(headers, "X-RateLimit-Hour-Reset");

  if (minuteLimit !== undefined) next.minuteLimit = minuteLimit;
  if (minuteRemaining !== undefined) next.minuteRemaining = minuteRemaining;
  if (minuteResetSeconds !== undefined) next.minuteResetSeconds = minuteResetSeconds;
  if (hourLimit !== undefined) next.hourLimit = hourLimit;
  if (hourRemaining !== undefined) next.hourRemaining = hourRemaining;
  if (hourResetSeconds !== undefined) next.hourResetSeconds = hourResetSeconds;

  return next;
}

function formatReset(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.ceil(minutes / 60)}h`;
}

function QuotaMeter({
  label,
  status,
}: {
  label: string;
  status: RateLimitStatus | null;
}) {
  const remaining = label === "This minute" ? status?.minuteRemaining : status?.hourRemaining;
  const limit = label === "This minute" ? status?.minuteLimit : status?.hourLimit;
  const resetSeconds = label === "This minute" ? status?.minuteResetSeconds : status?.hourResetSeconds;
  const isLoading = remaining === undefined || limit === undefined || resetSeconds === undefined;
  const safeRemaining = remaining ?? 0;
  const safeLimit = limit ?? 0;
  const safeResetSeconds = resetSeconds ?? 0;
  const clampedRemaining = Math.max(safeRemaining, 0);
  const percent = safeLimit > 0 ? Math.max(0, Math.min(100, (clampedRemaining / safeLimit) * 100)) : 0;
  const isEmpty = !isLoading && clampedRemaining === 0;

  return (
    <div className="min-w-0 flex-1 rounded-sm border border-zinc-800 bg-zinc-900/60 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-xs font-bold uppercase text-zinc-400">
          <MessagesSquare className="h-3.5 w-3.5 text-emerald-400" />
          {label}
        </span>
        <span className={`text-sm font-bold ${isEmpty ? "text-red-300" : "text-zinc-100"}`}>
          {isLoading ? "--" : `${clampedRemaining}/${safeLimit}`}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-sm bg-zinc-800">
        <div
          className={`h-full rounded-sm ${isEmpty ? "bg-red-400" : "bg-emerald-400"}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-zinc-500">
        <Clock3 className="h-3.5 w-3.5" />
        {isLoading ? "Checking quota" : `Resets in ${formatReset(safeResetSeconds)}`}
      </p>
    </div>
  );
}

function rateLimitStatusFromResponse(payload: RateLimitStatusResponse): RateLimitStatus {
  return {
    minuteRemaining: payload.minute?.remaining ?? DEFAULT_RATE_LIMIT_STATUS.minuteRemaining,
    minuteLimit: payload.minute?.limit ?? DEFAULT_RATE_LIMIT_STATUS.minuteLimit,
    minuteResetSeconds: payload.minute?.resetSeconds ?? DEFAULT_RATE_LIMIT_STATUS.minuteResetSeconds,
    hourRemaining: payload.hour?.remaining ?? DEFAULT_RATE_LIMIT_STATUS.hourRemaining,
    hourLimit: payload.hour?.limit ?? DEFAULT_RATE_LIMIT_STATUS.hourLimit,
    hourResetSeconds: payload.hour?.resetSeconds ?? DEFAULT_RATE_LIMIT_STATUS.hourResetSeconds,
  };
}

async function fetchProjectAskRateLimit(projectId: string) {
  const response = await fetch(`/api/projects/${projectId}/ask`, {
    method: "GET",
  });

  if (!response.ok) return null;
  const payload = (await response.json()) as RateLimitStatusResponse;
  return rateLimitStatusFromResponse(payload);
}

async function streamProjectAnswer(
  projectId: string,
  question: string,
  history: ChatMessage[],
  onToken: (token: string) => void,
  onRateLimit: (rateLimit: RateLimitUpdate) => void
) {
  const response = await fetch(`/api/projects/${projectId}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, history: history.slice(-6) }),
  });
  const rateLimit = readRateLimitHeaders(response.headers);
  onRateLimit(rateLimit);

  if (!response.ok) {
    const contentType = response.headers.get("content-type") ?? "";
    const errorPayload = contentType.includes("application/json")
      ? ((await response.json()) as { error?: unknown })
      : { error: await response.text() };
    throw new ProjectAnswerError(
      typeof errorPayload.error === "string"
        ? errorPayload.error
        : "The project docs answer could not be loaded.",
      rateLimit
    );
  }

  if (!response.body) throw new Error("Project docs response did not stream");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    onToken(decoder.decode(value, { stream: true }));
  }

  const remainder = decoder.decode();
  if (remainder) onToken(remainder);
}

function isGreeting(value: string) {
  return /^(hi|hello|hey|yo|sup|hii|heyy|thanks|thank you|ok|okay)[.!?]*$/i.test(value.trim());
}

function greetingReply(projectName: string) {
  return `Hi. I can help with ${projectName}'s docs, setup, architecture, contribution flow, and open issues.`;
}

function isChatErrorMessage(message: ChatMessage) {
  return (
    message.transient === true ||
    CHAT_ERROR_PREFIXES.some((prefix) => message.content.startsWith(prefix))
  );
}

function chatHistoryForApi(messages: ChatMessage[]) {
  return messages
    .filter((message) => message.content.trim() && !isChatErrorMessage(message))
    .slice(-6)
    .map(({ role, content }) => ({ role, content }));
}

export function ProjectDocsChatSheet({
  projectId,
  projectName,
  open,
  onOpenChange,
}: {
  projectId: string;
  projectName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isAsking, setIsAsking] = useState(false);
  const [rateLimit, setRateLimit] = useState<RateLimitStatus | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const quotaRemaining = !!rateLimit && rateLimit.minuteRemaining > 0 && rateLimit.hourRemaining > 0;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isAsking, open]);

  useEffect(() => {
    if (!open) return;

    let ignore = false;
    setRateLimit(null);

    fetchProjectAskRateLimit(projectId).then((nextRateLimit) => {
      if (!ignore && nextRateLimit) {
        setRateLimit(nextRateLimit);
      }
    });

    return () => {
      ignore = true;
    };
  }, [open, projectId]);

  async function askDocs(value: string) {
    const trimmed = value.trim();
    if (!trimmed || isAsking) return;

    setQuestion("");

    if (isGreeting(trimmed)) {
      setMessages((current) => [
        ...current,
        { role: "user", content: trimmed },
        { role: "assistant", content: greetingReply(projectName) },
      ]);
      return;
    }

    const history = chatHistoryForApi(messages);
    setIsAsking(true);
    setMessages((current) => [
      ...current,
      { role: "user", content: trimmed },
      { role: "assistant", content: "" },
    ]);

    try {
      await streamProjectAnswer(
        projectId,
        trimmed,
        history,
        (token) => {
          setMessages((current) => {
            const next = [...current];
            const last = next[next.length - 1];
            if (last?.role === "assistant") {
              next[next.length - 1] = { ...last, content: last.content + token };
            }
            return next;
          });
        },
        (nextRateLimit) => {
          setRateLimit((current) => ({ ...(current ?? DEFAULT_RATE_LIMIT_STATUS), ...nextRateLimit }));
        }
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "The project docs answer could not be loaded.";
      if (error instanceof ProjectAnswerError && error.rateLimit) {
        setRateLimit((current) => ({ ...(current ?? DEFAULT_RATE_LIMIT_STATUS), ...error.rateLimit }));
      }
      setMessages((current) => {
        const next = [...current];
        const last = next[next.length - 1];
        if (last?.role === "assistant" && !last.content) {
          next[next.length - 1] = {
            role: "assistant",
            content: errorMessage,
            transient: true,
          };
        }
        return next;
      });
    } finally {
      setIsAsking(false);
    }
  }

  function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    askDocs(question);
  }

  return (
    <Sheet open={open}>
      <SheetOverlay open={open} onClick={() => onOpenChange(false)} />
      <SheetContent open={open} className="max-w-[480px]">
        <SheetHeader className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <SheetTitle>Ask the project docs</SheetTitle>
              <SheetDescription>{projectName}</SheetDescription>
            </div>
            <SheetClose onClick={() => onOpenChange(false)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <QuotaMeter
              label="This minute"
              status={rateLimit}
            />
            <QuotaMeter
              label="This hour"
              status={rateLimit}
            />
          </div>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="custom-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
            {messages.length === 0 ? (
              <div className="rounded-sm border border-zinc-800 bg-zinc-900/40 p-4">
                <p className="text-sm font-medium leading-6 text-zinc-300">
                  Pick a starting point or ask directly.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {SUGGESTED_QUESTIONS.map((suggestion) => (
                    <Button
                      key={suggestion}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => askDocs(suggestion)}
                      disabled={isAsking || !quotaRemaining}
                      className="h-auto min-h-8 justify-start whitespace-normal text-left"
                    >
                      {suggestion}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-sm border px-3 py-2 text-sm leading-6 ${
                      message.role === "user"
                        ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-50"
                        : "border-zinc-800 bg-zinc-900 text-zinc-100"
                    }`}
                  >
                    {message.content ? (
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    ) : (
                      <div className="flex items-center gap-2 text-zinc-400">
                        <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                        Reading project docs...
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={submitQuestion} className="border-t border-zinc-800 p-4">
            {!quotaRemaining && (
              <p className="mb-3 rounded-sm border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-200">
                Message limit reached. Try again when the quota resets.
              </p>
            )}
            <div className="flex items-center gap-2">
              <Input
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder={
                  !rateLimit
                    ? "Checking message limit..."
                    : quotaRemaining
                      ? "Ask a question about this project..."
                      : "Message limit reached"
                }
                disabled={isAsking || !quotaRemaining}
                className="h-11"
              />
              <Button
                type="submit"
                size="icon"
                disabled={isAsking || !quotaRemaining || question.trim().length === 0}
                aria-label="Ask project docs"
                title="Ask"
                className="h-11 w-11 shrink-0"
              >
                {isAsking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
