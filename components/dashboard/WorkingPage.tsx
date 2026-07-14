"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  FolderGit2,
  GitPullRequest,
  ListChecks,
  Loader2,
  X,
} from "lucide-react";
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
import { apiJson } from "@/lib/api-client";

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
  const response = await fetch("/api/working");
  if (response.status === 401) {
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  if (!response.ok) throw new Error("Failed to load active work");
  return (await response.json()) as WorkingResponse;
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function WorkingPageSkeleton() {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {[1, 2, 3, 4].map((item) => (
        <Card key={item} className="h-72 animate-pulse bg-zinc-900/60" />
      ))}
    </div>
  );
}

function EmptyWorkingState() {
  return (
    <Card className="flex min-h-[420px] flex-col items-center justify-center p-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-sm border border-zinc-800 bg-zinc-900">
        <ListChecks className="h-7 w-7 text-zinc-500" />
      </div>
      <h2 className="mt-6 text-2xl font-bold tracking-tight text-zinc-100">No active work yet</h2>
      <p className="mt-3 max-w-lg text-sm leading-6 text-zinc-500">
        Add issues from your dashboard recommendations when you decide to work on them. They will appear here with repo details, GitHub links, and progress actions.
      </p>
      <Link
        href="/dashboard"
        className="mt-7 inline-flex h-11 items-center justify-center gap-2 rounded-sm bg-emerald-500 px-5 text-sm font-bold text-zinc-950 transition-colors hover:bg-emerald-400"
      >
        Browse dashboard matches <ArrowRight className="h-4 w-4" />
      </Link>
    </Card>
  );
}

export function WorkingPage() {
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
  const repoCount = new Set(items.map((item) => item.issue.repo.id)).size;
  const estimatedHours = items.reduce((total, item) => total + (item.issue.estimatedHours ?? 0), 0);

  return (
    <section className="mx-auto max-w-7xl space-y-8 px-6 py-8 sm:px-8">
      <header className="flex flex-col gap-5 border-b border-zinc-900 pb-7 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-400">Active queue</p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight text-zinc-100">Working on this</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-500">
            Issues you marked as active from the dashboard. Use this page to jump back to the issue, open the repository, or clear work that is no longer active.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex h-10 w-fit items-center justify-center gap-2 rounded-sm border border-zinc-800 bg-zinc-900 px-4 text-sm font-bold text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white"
        >
          Add from dashboard <ArrowRight className="h-4 w-4" />
        </Link>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <CheckCircle2 className="mb-3 h-4 w-4 text-emerald-400" />
          <p className="text-2xl font-bold text-zinc-100">{workingQuery.data?.count ?? 0}</p>
          <p className="text-xs font-medium text-zinc-500">Active issues</p>
        </Card>
        <Card className="p-4">
          <FolderGit2 className="mb-3 h-4 w-4 text-zinc-500" />
          <p className="text-2xl font-bold text-zinc-100">{repoCount}</p>
          <p className="text-xs font-medium text-zinc-500">Repositories</p>
        </Card>
        <Card className="p-4">
          <Clock className="mb-3 h-4 w-4 text-zinc-500" />
          <p className="text-2xl font-bold text-zinc-100">{estimatedHours}</p>
          <p className="text-xs font-medium text-zinc-500">Estimated hours</p>
        </Card>
      </div>

      {workingQuery.isLoading ? (
        <WorkingPageSkeleton />
      ) : workingQuery.isError ? (
        <Card className="p-8 text-sm font-medium text-red-300">
          Active work could not be loaded.
        </Card>
      ) : items.length === 0 ? (
        <EmptyWorkingState />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {items.map((item) => (
            <Card key={item.id} className="flex min-h-72 flex-col transition-colors hover:border-zinc-700">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-zinc-500">
                      {item.issue.repo.fullName}
                      {item.issue.repo.language ? ` - ${item.issue.repo.language}` : ""}
                    </p>
                    <CardTitle className="mt-2 line-clamp-2 text-lg leading-6">{item.issue.title}</CardTitle>
                  </div>
                  <Badge variant="success">Active</Badge>
                </div>
                <CardDescription className="line-clamp-3">
                  {item.issue.aiSummary || "No AI summary available yet."}
                </CardDescription>
              </CardHeader>

              <CardContent className="flex-1 space-y-4">
                <div className="flex flex-wrap gap-2">
                  {item.issue.difficulty && <Badge variant="outline">{titleCase(item.issue.difficulty)}</Badge>}
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

                <div className="flex flex-wrap gap-2">
                  {item.issue.requiredSkills.slice(0, 6).map((skill) => (
                    <span key={skill} className="rounded-sm bg-zinc-900 px-2 py-1 text-[11px] font-medium text-zinc-500">
                      {skill}
                    </span>
                  ))}
                </div>

                <p className="text-xs font-medium text-zinc-600">
                  Added {formatDate(item.createdAt)}
                </p>
              </CardContent>

              <CardFooter className="justify-between border-t border-zinc-900 pt-4">
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/issues/${item.issue.id}`}
                    className="inline-flex h-9 items-center justify-center rounded-sm bg-emerald-500 px-3 text-xs font-bold text-zinc-950 transition-colors hover:bg-emerald-400"
                  >
                    View issue
                  </Link>
                  <Link
                    href={`/projects/${item.issue.repo.id}`}
                    className="inline-flex h-9 items-center justify-center rounded-sm border border-zinc-800 bg-zinc-950 px-3 text-xs font-bold text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white"
                  >
                    View project
                  </Link>
                </div>
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
                    {clearWorkingMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                  </Button>
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
