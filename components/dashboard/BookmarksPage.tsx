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
import { Bookmark, CheckCircle2, Clock, ExternalLink, GitPullRequest, Trash2 } from "lucide-react";
import Link from "next/link";

type BookmarkIssue = {
  id: string;
  title: string;
  aiSummary: string | null;
  difficulty: string | null;
  estimatedHours: number | null;
  issueType: string | null;
  githubUrl: string;
  requiredSkills: string[];
  state: "open" | "closed";
  isWorking: boolean;
  repo: {
    id: string;
    owner: string;
    name: string;
    fullName: string;
    language: string | null;
    maintainerScore: number;
  };
};

type BookmarkItem = {
  id: string;
  createdAt: string;
  issue: BookmarkIssue;
};

type BookmarksResponse = {
  totalBookmarks: number;
  weeklyBookmarks: number;
  bookmarks: BookmarkItem[];
};

async function fetchBookmarks() {
  const response = await fetch("/api/bookmarks");
  if (!response.ok) throw new Error("Failed to load bookmarks");
  return (await response.json()) as BookmarksResponse;
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

export function BookmarksPage() {
  const queryClient = useQueryClient();
  const bookmarksQuery = useQuery({
    queryKey: ["bookmarks"],
    queryFn: fetchBookmarks,
  });

  const removeBookmarkMutation = useMutation({
    mutationFn: async (issueId: string) => {
      const response = await fetch("/api/bookmarks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId }),
      });
      if (!response.ok) throw new Error("Failed to remove bookmark");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
      queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
  });

  const workingMutation = useMutation({
    mutationFn: async (issueId: string) => {
      const response = await fetch(`/api/issues/${issueId}/working`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to update active work");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
      queryClient.invalidateQueries({ queryKey: ["working"] });
      queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
  });

  const bookmarks = bookmarksQuery.data?.bookmarks ?? [];

  return (
    <section className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        <div className="flex flex-col gap-4 border-b border-zinc-900 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-500">
              Saved work
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-100">
              Bookmarks
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
              Issues you saved from recommendations, kept here for later review.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:w-56">
            <Card className="p-3">
              <p className="text-xl font-bold text-zinc-100">
                {bookmarksQuery.data?.totalBookmarks ?? 0}
              </p>
              <p className="text-[11px] font-medium text-zinc-500">Saved</p>
            </Card>
            <Card className="p-3">
              <p className="text-xl font-bold text-zinc-100">
                {bookmarksQuery.data?.weeklyBookmarks ?? 0}
              </p>
              <p className="text-[11px] font-medium text-zinc-500">This week</p>
            </Card>
          </div>
        </div>

        {bookmarksQuery.isLoading ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {[1, 2, 3, 4].map((item) => (
              <Card key={item} className="h-56 animate-pulse bg-zinc-900/60" />
            ))}
          </div>
        ) : bookmarksQuery.isError ? (
          <Card className="p-8 text-center">
            <Bookmark className="mx-auto h-8 w-8 text-zinc-700" />
            <p className="mt-3 text-sm font-medium text-zinc-500">
              Bookmarks could not be loaded.
            </p>
          </Card>
        ) : bookmarks.length === 0 ? (
          <Card className="p-10 text-center">
            <Bookmark className="mx-auto h-10 w-10 text-zinc-700" />
            <h2 className="mt-4 text-lg font-bold text-zinc-100">No bookmarks yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-500">
              Save issues from the dashboard and they will appear here.
            </p>
            <Link
              href="/dashboard"
              className="mt-6 inline-flex h-10 items-center justify-center rounded-sm bg-emerald-500 px-4 text-sm font-bold text-zinc-950 transition-colors hover:bg-emerald-400"
            >
              Browse recommendations
            </Link>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {bookmarks.map((bookmark) => (
              <Card key={bookmark.id} className="flex min-h-64 flex-col">
                <CardHeader>
                  <div className="mb-2 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-zinc-500">
                        {bookmark.issue.repo.fullName}
                      </p>
                      <CardTitle className="mt-1 line-clamp-2">
                        {bookmark.issue.title}
                      </CardTitle>
                    </div>
                    <Badge variant={bookmark.issue.state === "open" ? "success" : "secondary"}>
                      {bookmark.issue.state}
                    </Badge>
                    {bookmark.issue.isWorking && (
                      <Badge variant="success">
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                        Working
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="line-clamp-3">
                    {bookmark.issue.aiSummary || "No AI summary available yet."}
                  </CardDescription>
                </CardHeader>

                <CardContent className="flex-1 space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {bookmark.issue.difficulty && (
                      <Badge variant="outline">{titleCase(bookmark.issue.difficulty)}</Badge>
                    )}
                    {bookmark.issue.issueType && (
                      <Badge variant="secondary">
                        <GitPullRequest className="mr-1 h-3 w-3" />
                        {titleCase(bookmark.issue.issueType)}
                      </Badge>
                    )}
                    {bookmark.issue.estimatedHours !== null && (
                      <Badge variant="secondary">
                        <Clock className="mr-1 h-3 w-3" />
                        {bookmark.issue.estimatedHours}h
                      </Badge>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {bookmark.issue.requiredSkills.slice(0, 5).map((skill) => (
                      <span
                        key={skill}
                        className="rounded-sm bg-zinc-900 px-2 py-1 text-[11px] font-medium text-zinc-500"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>

                  <p className="text-xs font-medium text-zinc-600">
                    Saved {formatDate(bookmark.createdAt)}
                  </p>
                </CardContent>

                <CardFooter className="justify-between border-t border-zinc-900 pt-4">
                  <Link
                    href={`/issues/${bookmark.issue.id}`}
                    className="inline-flex h-9 items-center justify-center rounded-sm bg-emerald-500 px-3 text-xs font-bold text-zinc-950 transition-colors hover:bg-emerald-400"
                  >
                    View issue
                  </Link>
                  <div className="flex items-center gap-2">
                    <a
                      href={bookmark.issue.githubUrl}
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
                      variant={bookmark.issue.isWorking ? "secondary" : "outline"}
                      size="icon"
                      onClick={() => workingMutation.mutate(bookmark.issue.id)}
                      disabled={workingMutation.isPending}
                      aria-label={bookmark.issue.isWorking ? "Stop working on this issue" : "Mark as working"}
                      title={bookmark.issue.isWorking ? "Stop working" : "Working on this"}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => removeBookmarkMutation.mutate(bookmark.issue.id)}
                      disabled={removeBookmarkMutation.isPending}
                      aria-label="Remove bookmark"
                      title="Remove bookmark"
                    >
                      <Trash2 className="h-4 w-4" />
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
