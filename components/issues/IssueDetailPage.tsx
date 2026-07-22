"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bookmark,
  Clock,
  ExternalLink,
  FolderGit2,
  GitPullRequest,
  Loader2,
  MessageSquare,
  RefreshCw,
  Target,
  ThumbsDown,
} from "lucide-react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { IssueLoadingSkeleton } from "@/components/issues/IssueLoadingSkeleton";
import type { IssueDetailResponse } from "@/components/issues/types";
import { formatDate, percentage, scoreTone, titleCase } from "@/components/issues/issue-utils";
import { GitHubMark } from "@/components/project/project-utils";

async function fetchIssue(issueId: string) {
  const response = await fetch(`/api/issues/${issueId}`);
  if (!response.ok) throw new Error("Failed to load issue");
  return (await response.json()) as IssueDetailResponse;
}

async function toggleWorking(issueId: string) {
  const response = await fetch(`/api/issues/${issueId}/working`, {
    method: "POST",
  });
  if (!response.ok) throw new Error("Failed to update working state");
  return (await response.json()) as { working: boolean };
}

function ProgressRow({ label, value }: { label: string; value: number }) {
  const width = percentage(value);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm font-medium">
        <span className="text-white">{label}</span>
        <span className="text-zinc-100">{width}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-sm bg-zinc-900">
        <div className="h-full rounded-sm bg-emerald-400" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: typeof Clock;
  tone?: string;
}) {
  return (
    <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-zinc-300">{label}</p>
        <Icon className="h-4 w-4 text-zinc-300" />
      </div>
      <p className={`text-2xl font-semibold leading-none ${tone ?? "text-white"}`}>{value}</p>
    </div>
  );
}

function TagPill({ children, variant = "default" }: { children: React.ReactNode; variant?: "default" | "green" | "red" | "amber" }) {
  const classes = {
    default: "border-zinc-800 bg-zinc-900 text-white",
    green: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    red: "border-red-500/30 bg-red-500/10 text-red-300",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  };

  return (
    <span className={`inline-flex h-7 items-center rounded-sm border px-2.5 text-xs font-bold ${classes[variant]}`}>
      {children}
    </span>
  );
}

export function IssueDetailPage({ issueId }: { issueId: string }) {
  const queryClient = useQueryClient();

  const issueQuery = useQuery({
    queryKey: ["issue", issueId],
    queryFn: () => fetchIssue(issueId),
  });

  const workingMutation = useMutation({
    mutationFn: () => toggleWorking(issueId),
    onSuccess: (data) => {
      queryClient.setQueryData<IssueDetailResponse>(["issue", issueId], (current) => {
        if (!current) return current;

        const nextWorkersCount =
          data.working === current.isWorking
            ? current.workersCount
            : Math.max(0, current.workersCount + (data.working ? 1 : -1));

        return {
          ...current,
          isWorking: data.working,
          workersCount: nextWorkersCount,
        };
      });
      queryClient.invalidateQueries({ queryKey: ["issue", issueId] });
    },
  });

  if (issueQuery.isLoading) {
    return <IssueLoadingSkeleton />;
  }

  if (issueQuery.isError || !issueQuery.data) {
    return (
      <section className="flex min-h-screen items-center justify-center p-6 text-zinc-50">
        <div className="w-full max-w-md rounded-sm border border-red-500/30 bg-red-500/10 p-5 text-center">
          <p className="mb-4 text-sm font-medium text-red-300">Issue could not be loaded.</p>
          <button
            type="button"
            onClick={() => issueQuery.refetch()}
            className="inline-flex items-center gap-2 rounded-sm bg-white px-4 py-2 text-sm font-bold text-zinc-950 transition-colors hover:bg-zinc-200"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
        </div>
      </section>
    );
  }

  const { issue, match, similarIssues, comments, isWorking } = issueQuery.data;
  const displayedComments = comments.slice(0, 3);
  const matchScore = match ? Math.round(match.score * 100) : null;
  const issueTypeLabel = issue.issueType ? titleCase(issue.issueType) : "Issue";
  const difficultyLabel = issue.difficulty ? titleCase(issue.difficulty) : "Unrated";
  const logoUrl = `https://github.com/${issue.repo.owner}.png`;
  const issueMetaLine = [
    issue.issueType ? issueTypeLabel.toLowerCase() : null,
    ...issue.labels.slice(0, 3),
  ].filter(Boolean);
  return (
    <section className="px-6 py-6 text-zinc-50 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-sm border border-zinc-800 bg-zinc-950 p-5">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="flex min-w-0 gap-4">
              <div
                className="h-14 w-14 shrink-0 rounded-sm border border-zinc-800 bg-zinc-900 bg-cover bg-center"
                style={{ backgroundImage: `url(${logoUrl})` }}
                aria-label={`${issue.repo.owner} logo`}
              />
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-widest text-emerald-400">Maintainer</p>
                <h2 className="mt-1 text-xl font-bold text-white">{issue.repo.owner}/{issue.repo.name}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-300">
                  {issue.repo.description || "No project description available."}
                </p>
              </div>
            </div>
            <Link
              href={`/projects/${issue.repo.id}`}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-sm bg-emerald-500 px-4 text-sm font-bold text-zinc-950 transition-colors hover:bg-emerald-400"
            >
              View project
              <ExternalLink className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <ProgressRow label="Responsiveness" value={issue.repo.maintainerScore} />
            <ProgressRow label="Activity" value={issue.repo.activityScore} />
          </div>
        </section>

        <header className="rounded-sm border border-zinc-800 bg-zinc-950 p-5">
          <div className="space-y-3">
            <span className={`inline-flex h-7 items-center rounded-sm border px-2.5 text-xs font-bold ${
              issue.state === "open"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-red-500/30 bg-red-500/10 text-red-300"
            }`}>
              {titleCase(issue.state)}
            </span>
            <h1 className="max-w-5xl text-3xl font-bold leading-tight tracking-tight text-white">
              {issue.title}
            </h1>
            <p className="max-w-4xl text-sm leading-6 text-zinc-400">
              {issue.aiSummary || "No AI summary available yet."}
            </p>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => workingMutation.mutate()}
              disabled={workingMutation.isPending}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-sm bg-emerald-500 px-4 text-sm font-bold text-zinc-950 transition-colors hover:bg-emerald-400 disabled:opacity-60"
            >
              {workingMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderGit2 className="h-4 w-4" />}
              {isWorking ? "Working on this" : "I'm working on this"}
            </button>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-sm border border-zinc-800 bg-zinc-900 text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white"
              aria-label="Save issue"
              title="Save issue"
            >
              <Bookmark className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-sm border border-zinc-800 bg-zinc-900 text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white"
              aria-label="Not interested"
              title="Not interested"
            >
              <ThumbsDown className="h-4 w-4" />
            </button>
            <a
              href={issue.githubUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 w-10 items-center justify-center rounded-sm border border-zinc-800 bg-zinc-900 text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white"
              aria-label="Open issue on GitHub"
              title="Open on GitHub"
            >
              <GitHubMark className="h-5 w-5" />
            </a>
          </div>

          {issueMetaLine.length > 0 && (
            <p className="mt-4 text-base font-semibold text-zinc-400">
              {issueMetaLine.join(" / ")}
            </p>
          )}
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Match score"
            value={matchScore !== null ? `${matchScore}%` : "N/A"}
            icon={Target}
            tone={scoreTone(match?.score ?? 0)}
          />
          <StatCard label="Difficulty" value={difficultyLabel} icon={GitPullRequest} />
          <StatCard label="Time estimate" value={issue.estimatedHours !== null ? `${issue.estimatedHours}h` : "N/A"} icon={Clock} />
          <StatCard label="Comments" value={issue.commentCount.toString()} icon={MessageSquare} />
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-5">
            <h2 className="mb-5 text-lg font-semibold text-white">Match breakdown</h2>
            {match ? (
              <div className="space-y-5">
                <ProgressRow label="Skill" value={match.skillSim} />
                <ProgressRow label="Interest" value={match.interestSim} />
                <ProgressRow label="Difficulty fit" value={match.diffScore} />
              </div>
            ) : (
              <p className="text-sm font-medium text-zinc-300">No match score found for this issue.</p>
            )}
          </div>

          <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-5">
            <h2 className="mb-5 text-lg font-semibold text-white">Why this issue was matched</h2>
            <div className="mb-5 flex flex-wrap gap-2">
              {issue.requiredSkills.slice(0, 3).map((skill) => (
                <TagPill key={skill} variant="green">Uses {skill}</TagPill>
              ))}
              {issue.issueType && <TagPill variant="green">{issueTypeLabel}</TagPill>}
              {issue.difficulty && <TagPill variant="green">{difficultyLabel} difficulty</TagPill>}
            </div>
            <p className="mb-3 text-sm font-semibold text-zinc-300">Required skills</p>
            <div className="flex flex-wrap gap-2">
              {issue.requiredSkills.length > 0 ? (
                issue.requiredSkills.map((skill) => <TagPill key={skill}>{skill}</TagPill>)
              ) : (
                <span className="text-sm font-medium text-zinc-300">No required skills listed.</span>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-sm border border-emerald-500/20 bg-emerald-500/10 p-5">
          <h2 className="mb-2 text-sm font-bold text-emerald-300">AI summary</h2>
          <p className="text-base font-medium leading-7 text-emerald-200">
            {issue.aiSummary || "No AI summary available yet."}
          </p>
        </section>

        <section className="rounded-sm border border-zinc-800 bg-zinc-950 p-5">
          <h2 className="mb-4 text-lg font-semibold text-white">Description</h2>
          <div className="prose prose-invert prose-sm max-w-none text-sm leading-6 text-zinc-300">
            <ReactMarkdown>{issue.body || "No issue body provided."}</ReactMarkdown>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-bold tracking-tight text-white">Similar issues</h2>
          {similarIssues.length > 0 ? (
            <div className="space-y-4">
              {similarIssues.map((similarIssue) => {
                const similarLogoUrl = `https://github.com/${similarIssue.repo.owner}.png`;
                const similarReasons = [
                  similarIssue.requiredSkills.length > 0
                    ? `Uses ${similarIssue.requiredSkills.slice(0, 2).join(", ")}`
                    : null,
                  similarIssue.issueType ? `${titleCase(similarIssue.issueType)} issue` : null,
                  similarIssue.difficulty && similarIssue.estimatedHours !== null
                    ? `${titleCase(similarIssue.difficulty)}, about ${similarIssue.estimatedHours}h`
                    : null,
                ].filter(Boolean);

                return (
                  <article key={similarIssue.id} className="rounded-sm border border-zinc-800 bg-zinc-950 p-5 transition-colors hover:border-zinc-700">
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div className="flex min-w-0 items-start gap-3">
                        <div
                          className="h-14 w-14 shrink-0 rounded-sm border border-zinc-800 bg-zinc-900 bg-cover bg-center"
                          style={{ backgroundImage: `url(${similarLogoUrl})` }}
                          aria-label={`${similarIssue.repo.owner} logo`}
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-white">
                            <Link
                              href={`/projects/${similarIssue.repo.id}`}
                              className="inline-flex h-8 max-w-40 items-center truncate rounded-sm border border-zinc-800 bg-zinc-900 px-2.5 text-xs font-medium text-white hover:border-zinc-700"
                              title={similarIssue.repo.owner}
                            >
                              {similarIssue.repo.owner}
                            </Link>
                            <a
                              href={`https://github.com/${similarIssue.repo.owner}/${similarIssue.repo.name}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-zinc-800 bg-zinc-900 text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white"
                              aria-label="Open repository on GitHub"
                              title="Open on GitHub"
                            >
                              <GitHubMark className="h-4 w-4" />
                            </a>
                          </div>
                          <Link
                            href={`/issues/${similarIssue.id}`}
                            className="mt-1 block text-base font-bold leading-6 text-zinc-100 hover:text-white"
                          >
                            {similarIssue.title}
                          </Link>
                        </div>
                      </div>
                      <span className="shrink-0 rounded-sm border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-300">
                        Similar
                      </span>
                    </div>

                    <p className="mb-4 line-clamp-3 text-sm leading-6 text-zinc-400">
                      {similarIssue.aiSummary || "No AI summary available yet."}
                    </p>

                    <div className="mb-5 flex flex-wrap gap-2">
                      {similarIssue.difficulty && <TagPill variant="amber">{titleCase(similarIssue.difficulty)}</TagPill>}
                      {similarIssue.estimatedHours !== null && (
                        <span className="inline-flex items-center gap-1 rounded-sm border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs font-medium text-zinc-300">
                          <Clock className="h-3 w-3" />
                          {similarIssue.estimatedHours}h
                        </span>
                      )}
                      {similarIssue.issueType && (
                        <span className="inline-flex items-center gap-1 rounded-sm border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs font-medium text-zinc-300">
                          <GitPullRequest className="h-3 w-3" />
                          {titleCase(similarIssue.issueType)}
                        </span>
                      )}
                    </div>

                    {similarReasons.length > 0 && (
                      <div className="mb-5 rounded-sm border border-zinc-900 bg-zinc-900/40 p-3">
                        <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-400">
                          Why this match
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {similarReasons.map((reason) => (
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
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        {similarIssue.requiredSkills.slice(0, 3).map((skill) => (
                          <span key={skill} className="inline-flex h-9 items-center rounded-sm bg-zinc-900 px-3 text-xs font-medium text-zinc-300">
                            {skill}
                          </span>
                        ))}
                        <Link
                          href={`/projects/${similarIssue.repo.id}`}
                          className="inline-flex h-9 items-center justify-center rounded-sm bg-emerald-500 px-4 text-sm font-bold text-zinc-950 shadow-sm shadow-emerald-950/40 transition-colors hover:bg-emerald-400"
                        >
                          View Project
                        </Link>
                        <Link
                          href={`/issues/${similarIssue.id}`}
                          className="inline-flex h-9 items-center justify-center rounded-sm border border-zinc-800 bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:border-zinc-700 hover:bg-zinc-800"
                        >
                          View Issue
                        </Link>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <a
                          href={similarIssue.githubUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-sm border border-zinc-800 bg-zinc-900 p-2 text-zinc-400 transition-colors hover:border-zinc-700 hover:text-white"
                          aria-label="Open similar issue on GitHub"
                          title="Open on GitHub"
                        >
                          <GitHubMark className="h-4 w-4" />
                        </a>
                        <button
                          type="button"
                          className="rounded-sm border border-zinc-800 bg-zinc-900 p-2 text-zinc-400 transition-colors hover:border-zinc-700 hover:text-white"
                          aria-label="Bookmark issue"
                          title="Bookmark"
                        >
                          <Bookmark className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-8 text-center text-sm font-medium text-zinc-300">
              No similar issues found.
            </div>
          )}
        </section>

        <section className="mx-auto max-w-5xl rounded-sm border border-zinc-800 bg-zinc-950 p-5">
          <h2 className="mb-5 text-lg font-semibold text-white">Comments</h2>
          {displayedComments.length > 0 ? (
            <div className="divide-y divide-zinc-800">
              {displayedComments.map((comment) => (
                <article key={comment.id} className="py-4 first:pt-0">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <a
                      href={comment.author?.githubUrl ?? comment.githubUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-bold text-white hover:text-emerald-300"
                    >
                      {comment.author?.login ?? "GitHub user"}
                    </a>
                    <span className="shrink-0 text-xs font-medium text-zinc-400">{formatDate(comment.createdAt)}</span>
                  </div>
                  <p className="line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-zinc-300">
                    {comment.body || "No comment body provided."}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <p className="text-sm font-medium text-zinc-300">
              {issue.commentCount > 0 ? "Recent comments are unavailable here right now." : "No comments yet."}
            </p>
          )}
          <a
            href={issue.githubUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-sm border border-zinc-700 bg-zinc-900 text-sm font-bold text-white transition-colors hover:border-emerald-500/60 hover:text-emerald-300"
          >
            View all on GitHub
            <ExternalLink className="h-4 w-4" />
          </a>
        </section>
      </div>
    </section>
  );
}
