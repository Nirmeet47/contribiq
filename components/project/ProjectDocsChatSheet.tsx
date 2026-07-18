"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
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

async function streamProjectAnswer(
  projectId: string,
  question: string,
  history: ChatMessage[],
  onToken: (token: string) => void
) {
  const response = await fetch(`/api/projects/${projectId}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, history: history.slice(-6) }),
  });

  if (!response.ok) {
    const contentType = response.headers.get("content-type") ?? "";
    const errorPayload = contentType.includes("application/json")
      ? ((await response.json()) as { error?: unknown })
      : { error: await response.text() };
    throw new Error(
      typeof errorPayload.error === "string"
        ? errorPayload.error
        : "The project docs answer could not be loaded."
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isAsking, open]);

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
      await streamProjectAnswer(projectId, trimmed, history, (token) => {
        setMessages((current) => {
          const next = [...current];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            next[next.length - 1] = { ...last, content: last.content + token };
          }
          return next;
        });
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "The project docs answer could not be loaded.";
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
      <SheetContent open={open}>
        <SheetHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <SheetTitle>Ask the project docs</SheetTitle>
              <SheetDescription>
                Answers use the indexed README, contributing docs, repo stats, and recent chat turns.
              </SheetDescription>
            </div>
            <SheetClose onClick={() => onOpenChange(false)} />
          </div>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
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
                      disabled={isAsking}
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
            <div className="flex items-center gap-2">
              <Input
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Ask a question about this project..."
                disabled={isAsking}
                className="h-11"
              />
              <Button
                type="submit"
                size="icon"
                disabled={isAsking || question.trim().length === 0}
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
