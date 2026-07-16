"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CheckCircle2, Clock, ExternalLink, GitPullRequest, X } from "lucide-react";
import Link from "next/link";
import { apiGet, apiJson } from "@/lib/api-client";

type WorkingIssue = {
  id: string;
  title: string;
  aiSummary: string | null;
  difficulty: string | null;
  estimatedHours: number | null;
  issueType: string | null;
  githubUrl: string;
  requiredSkills: string[];
  repo: {
    id: string;
    owner: string;
    name: string;
    fullName: string;
    language: string | null;
  };
};

type WorkingItem = {
  id: string;
  createdAt: string;
  issue: WorkingIssue;
};

type WorkingResponse = {
  count: number;
  items: WorkingItem[];
};

async function fetchWorkingIssues() {
  return apiGet<WorkingResponse>("/api/working", "Failed to load active work");
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export function WorkingIssues() {
  const queryClient = useQueryClient();
  const workingQuery = useQuery({
    queryKey: ["working"],
    queryFn: fetchWorkingIssues,
  });

  const clearWorkingMutation = useMutation({
    mutationFn: async (issueId: string) => {
      await apiJson(`/api/issues/${issueId}/working`, {
        fallbackMessage: "Failed to update active work",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["working"] });
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
    },
  });

  const items = workingQuery.data?.items ?? [];

  if (workingQuery.isLoading) {
    return (
      <Card className="h-40 animate-pulse bg-zinc-900/60" aria-label="Loading active work" />
    );
  }

  if (workingQuery.isError || items.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-zinc-100">Working on this</h2>
        <Badge variant="success">{workingQuery.data?.count ?? 0} active</Badge>
      </div>

      <div className="custom-scrollbar max-h-[360px] space-y-3 overflow-y-auto pr-2">
        {items.map((item) => (
          <Card key={item.id} className="transition-colors hover:border-zinc-700">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-zinc-500">
                    {item.issue.repo.fullName}
                    {item.issue.repo.language ? ` · ${item.issue.repo.language}` : ""}
                  </p>
                  <CardTitle className="mt-1 line-clamp-2">{item.issue.title}</CardTitle>
                </div>
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
              </div>
              <CardDescription className="line-clamp-2">
                {item.issue.aiSummary || "No AI summary available yet."}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-3 pb-4">
              <div className="flex flex-wrap gap-2">
                {item.issue.difficulty && (
                  <Badge variant="outline">{titleCase(item.issue.difficulty)}</Badge>
                )}
                {item.issue.issueType && (
                  <Badge variant="secondary">
                    <GitPullRequest className="mr-1 h-3 w-3" />
                    {titleCase(item.issue.issueType)}
                  </Badge>
                )}
                {item.issue.estimatedHours !== null && (
                  <Badge variant="secondary">
                    <Clock className="mr-1 h-3 w-3" />
                    {item.issue.estimatedHours}h
                  </Badge>
                )}
              </div>
              <p className="text-xs font-medium text-zinc-600">
                Started {formatDate(item.createdAt)}
              </p>
            </CardContent>

            <CardFooter className="justify-between border-t border-zinc-900 pt-4">
              <Link
                href={`/issues/${item.issue.id}`}
                className="inline-flex h-9 items-center justify-center rounded-sm bg-emerald-500 px-3 text-xs font-bold text-zinc-950 transition-colors hover:bg-emerald-400"
              >
                View issue
              </Link>
              <div className="flex items-center gap-2">
                <a
                  href={item.issue.githubUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-sm border border-zinc-800 bg-zinc-950 text-zinc-400 transition-colors hover:border-zinc-700 hover:text-white"
                  aria-label="Open on GitHub"
                  title="Open on GitHub"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => clearWorkingMutation.mutate(item.issue.id)}
                  disabled={clearWorkingMutation.isPending}
                  aria-label="Stop working on this issue"
                  title="Stop working"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardFooter>
          </Card>
        ))}
      </div>
    </section>
  );
}
