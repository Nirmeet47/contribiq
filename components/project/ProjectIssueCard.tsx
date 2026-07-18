"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bookmark, BookmarkCheck, CheckCircle2, Clock, GitPullRequest, ThumbsDown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { apiJson } from "@/lib/api-client";
import type { ProjectIssue, ProjectResponse } from "@/components/project/types";
import { GitHubMark, titleCase } from "@/components/project/project-utils";

function issueReasons(issue: ProjectIssue, project: ProjectResponse["project"]) {
  const reasons = [];

  if (issue.requiredSkills.length > 0) {
    reasons.push(`Uses ${issue.requiredSkills.slice(0, 2).join(", ")}`);
  }
  if (project.language) {
    reasons.push(`${project.name} is primarily ${project.language}`);
  }
  if (issue.issueType) {
    reasons.push(`${titleCase(issue.issueType)} issue`);
  }
  if (issue.difficulty && issue.estimatedHours !== null) {
    reasons.push(`${titleCase(issue.difficulty)}, about ${issue.estimatedHours}h`);
  }

  return reasons.slice(0, 3);
}

export function ProjectIssueCard({
  issue,
  project,
}: {
  issue: ProjectIssue;
  project: ProjectResponse["project"];
}) {
  const queryClient = useQueryClient();
  const reasons = issueReasons(issue, project);
  const [bookmarked, setBookmarked] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const bookmarkMutation = useMutation({
    mutationFn: async (nextBookmarked: boolean) => {
      await apiJson("/api/bookmarks", {
        method: nextBookmarked ? "POST" : "DELETE",
        body: { issueId: issue.id },
        fallbackMessage: "Failed to update bookmark",
      });
    },
    onMutate: (nextBookmarked) => {
      setBookmarked(nextBookmarked);
      return { previousBookmarked: bookmarked };
    },
    onError: (_error, _nextBookmarked, context) => {
      if (context) setBookmarked(context.previousBookmarked);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
    },
  });

  const workingMutation = useMutation({
    mutationFn: async () => {
      return apiJson<{ working: boolean }>(`/api/issues/${issue.id}/working`, {
        fallbackMessage: "Failed to update working status",
      });
    },
    onSuccess: (payload) => {
      setIsWorking(payload.working);
      queryClient.invalidateQueries({ queryKey: ["working"] });
    },
  });

  const feedbackMutation = useMutation({
    mutationFn: async () => {
      await apiJson("/api/feedback", {
        body: { issueId: issue.id, type: "not_interested" },
        fallbackMessage: "Failed to dismiss issue",
      });
    },
    onSuccess: () => {
      setDismissed(true);
      queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
  });

  if (dismissed) return null;

  return (
    <article className="rounded-sm border border-zinc-800 bg-zinc-950 p-5 transition-colors hover:border-zinc-700">
      <div className="mb-4 flex items-start gap-3">
        <div
          className="h-14 w-14 shrink-0 rounded-sm border border-zinc-800 bg-zinc-900 bg-cover bg-center"
          style={{ backgroundImage: `url(https://github.com/${project.owner}.png)` }}
          aria-label={`${project.owner} logo`}
        />
        <div className="min-w-0">
          <Link
            href={`/projects/${project.id}`}
            className="inline-flex h-8 items-center rounded-sm border border-zinc-800 bg-zinc-900 px-2.5 text-xs font-medium text-white hover:border-zinc-700"
          >
            {project.owner}
          </Link>
          <Link
            href={`/issues/${issue.id}`}
            className="mt-1 block text-base font-bold leading-6 text-zinc-100 hover:text-white"
          >
            {issue.title}
          </Link>
        </div>
      </div>

      <p className="mb-4 line-clamp-3 text-sm leading-6 text-zinc-400">
        {issue.aiSummary || "No AI summary available yet."}
      </p>

      <div className="mb-5 flex flex-wrap gap-2">
        {issue.difficulty && (
          <span className="rounded-sm border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-xs font-medium text-sky-300">
            {titleCase(issue.difficulty)}
          </span>
        )}
        {issue.estimatedHours !== null && (
          <span className="inline-flex items-center gap-1 rounded-sm border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs font-medium text-zinc-300">
            <Clock className="h-3 w-3" />
            {issue.estimatedHours}h
          </span>
        )}
        {issue.issueType && (
          <span className="inline-flex items-center gap-1 rounded-sm border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs font-medium text-zinc-300">
            <GitPullRequest className="h-3 w-3" />
            {titleCase(issue.issueType)}
          </span>
        )}
      </div>

      {reasons.length > 0 && (
        <div className="mb-5 rounded-sm border border-zinc-900 bg-zinc-900/40 p-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-400">
            Why this issue
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {reasons.map((reason) => (
              <span
                key={reason}
                className="rounded-sm border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-200"
              >
                {reason}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4 border-t border-zinc-900 pt-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-wrap gap-2">
          {issue.requiredSkills.slice(0, 5).map((skill) => (
            <span key={skill} className="inline-flex h-9 items-center rounded-sm bg-zinc-900 px-3 text-xs font-medium text-zinc-300">
              {skill}
            </span>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={`/issues/${issue.id}`}
            className="inline-flex h-9 items-center justify-center rounded-sm bg-emerald-500 px-4 text-sm font-bold text-zinc-950 transition-colors hover:bg-emerald-400"
          >
            View Issue
          </Link>
          <a
            href={issue.githubUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 w-9 items-center justify-center rounded-sm border border-zinc-800 bg-zinc-900 text-zinc-400 transition-colors hover:border-zinc-700 hover:text-white"
            aria-label="Open issue on GitHub"
            title="Open on GitHub"
          >
            <GitHubMark className="h-5 w-5" />
          </a>
          <button
            type="button"
            onClick={() => workingMutation.mutate()}
            disabled={workingMutation.isPending}
            className={`inline-flex h-9 w-9 items-center justify-center rounded-sm border transition-colors disabled:opacity-50 ${
              isWorking
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:border-emerald-400/50 hover:bg-emerald-500/15"
            }`}
            aria-label={isWorking ? "Clear working status" : "Start working on this"}
            title={isWorking ? "Clear working status" : "Start working on this"}
          >
            <CheckCircle2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => bookmarkMutation.mutate(!bookmarked)}
            disabled={bookmarkMutation.isPending}
            className="inline-flex h-9 w-9 items-center justify-center rounded-sm border border-zinc-800 bg-zinc-900 text-zinc-400 transition-colors hover:border-zinc-700 hover:text-white disabled:opacity-50"
            aria-label={bookmarked ? "Remove bookmark" : "Bookmark issue"}
            title={bookmarked ? "Remove bookmark" : "Bookmark"}
          >
            {bookmarked ? <BookmarkCheck className="h-4 w-4 text-emerald-400" /> : <Bookmark className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => feedbackMutation.mutate()}
            disabled={feedbackMutation.isPending}
            className="inline-flex h-9 w-9 items-center justify-center rounded-sm border border-zinc-800 bg-zinc-900 text-zinc-400 transition-colors hover:border-zinc-700 hover:text-white disabled:opacity-50"
            aria-label="Not interested"
            title="Not interested"
          >
            <ThumbsDown className="h-4 w-4" />
          </button>
        </div>
      </div>
    </article>
  );
}
