"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/app/app-shell";
import {
  Clock,
  ExternalLink,
  GitPullRequest,
  Loader2,
  MessageSquare,
  RefreshCw,
  Tag,
  Users,
} from "lucide-react";
import { use } from "react";

type Difficulty = "beginner" | "intermediate" | "advanced";
type IssueType = "bug" | "feature" | "docs" | "refactor";

type IssueDetailResponse = {
  issue: {
    id: string;
    title: string;
    body: string | null;
    labels: string[];
    state: "open" | "closed";
    assigneeCount: number;
    commentCount: number;
    githubUrl: string;
    aiSummary: string | null;
    difficulty: Difficulty | null;
    estimatedHours: number | null;
    requiredSkills: string[];
    issueType: IssueType | null;
    createdAt: string;
    updatedAt: string;
    repo: {
      id: string;
      owner: string;
      name: string;
      description: string | null;
      stars: number;
      maintainerScore: number;
      activityScore: number;
    };
  };
  match: {
    score: number;
    skillSim: number;
    interestSim: number;
    diffScore: number;
  } | null;
  similarIssues: Array<{
    id: string;
    title: string;
    aiSummary: string | null;
    difficulty: Difficulty | null;
    issueType: IssueType | null;
    githubUrl: string;
    requiredSkills: string[];
  }>;
  comments: Array<{
    id: number;
    body: string | null;
    createdAt: string;
    githubUrl: string;
    author: {
      login: string;
      avatarUrl: string;
      githubUrl: string;
    } | null;
  }>;
  workersCount: number;
  isWorking: boolean;
};

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

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function scoreTone(score: number) {
  if (score >= 0.8) return "text-emerald-300";
  if (score >= 0.6) return "text-amber-300";
  return "text-zinc-300";
}

function percentage(value: number) {
  return Math.round(Math.max(0, Math.min(1, value)) * 100);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function ProgressRow({ label, value }: { label: string; value: number }) {
  const width = percentage(value);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider">
        <span className="text-zinc-500">{label}</span>
        <span className="text-zinc-300">{width}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-sm bg-zinc-800">
        <div className="h-full rounded-sm bg-emerald-400" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <section className="p-6 text-zinc-50 sm:p-8">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="h-40 animate-pulse rounded-sm border border-zinc-800 bg-zinc-900" />
          <div className="h-96 animate-pulse rounded-sm border border-zinc-800 bg-zinc-900" />
        </div>
        <div className="space-y-6">
          <div className="h-56 animate-pulse rounded-sm border border-zinc-800 bg-zinc-900" />
          <div className="h-40 animate-pulse rounded-sm border border-zinc-800 bg-zinc-900" />
          <div className="h-36 animate-pulse rounded-sm border border-zinc-800 bg-zinc-900" />
        </div>
      </div>
    </section>
  );
}

export default function IssuePage({
  params,
}: {
  params: Promise<{ issueId: string }>;
}) {
  const { issueId } = use(params);
  const queryClient = useQueryClient();

  const issueQuery = useQuery({
    queryKey: ["issue", issueId],
    queryFn: () => fetchIssue(issueId),
  });

  const workingMutation = useMutation({
    mutationFn: () => toggleWorking(issueId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["issue", issueId] }),
  });

  if (issueQuery.isLoading) {
    return (
      <AppShell>
        <LoadingSkeleton />
      </AppShell>
    );
  }

  if (issueQuery.isError || !issueQuery.data) {
    return (
      <AppShell>
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
      </AppShell>
    );
  }

  const { issue, match, similarIssues, comments, workersCount, isWorking } = issueQuery.data;
  const matchScore = match ? Math.round(match.score * 100) : 0;

  return (
    <AppShell>
    <section className="p-6 text-zinc-50 sm:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="space-y-2">
          <p className="text-sm font-bold uppercase tracking-widest text-emerald-400">
            {issue.repo.owner}/{issue.repo.name}
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-white">{issue.title}</h1>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <section className="space-y-6 lg:col-span-2">
            <div className="rounded-sm border border-emerald-800 bg-zinc-900 p-5">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-emerald-300">
                AI Summary
              </h2>
              <p className="text-sm leading-6 text-zinc-200">
                {issue.aiSummary || "No AI summary available yet."}
              </p>
            </div>

            <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-5">
              <div className="mb-5 flex flex-wrap gap-2">
                {issue.labels.map((label) => (
                  <span key={label} className="inline-flex items-center gap-1 rounded-sm border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs font-medium text-zinc-300">
                    <Tag className="h-3 w-3" />
                    {label}
                  </span>
                ))}
                <span className="inline-flex items-center gap-1 rounded-sm border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs font-medium text-zinc-300">
                  <Users className="h-3 w-3" />
                  {issue.assigneeCount} assignees
                </span>
                <span className="inline-flex items-center gap-1 rounded-sm border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs font-medium text-zinc-300">
                  <MessageSquare className="h-3 w-3" />
                  {issue.commentCount} comment{issue.commentCount === 1 ? "" : "s"}
                </span>
                {issue.issueType && (
                  <span className="inline-flex items-center gap-1 rounded-sm border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs font-medium text-zinc-300">
                    <GitPullRequest className="h-3 w-3" />
                    {titleCase(issue.issueType)}
                  </span>
                )}
                {issue.difficulty && (
                  <span className="rounded-sm border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-xs font-bold text-sky-300">
                    {titleCase(issue.difficulty)}
                  </span>
                )}
                {issue.estimatedHours !== null && (
                  <span className="inline-flex items-center gap-1 rounded-sm border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs font-medium text-zinc-300">
                    <Clock className="h-3 w-3" />
                    {issue.estimatedHours}h
                  </span>
                )}
              </div>

              <pre className="whitespace-pre-wrap rounded-sm border border-zinc-900 bg-zinc-950 p-4 text-sm leading-6 text-zinc-300">
                {issue.body || "No issue body provided."}
              </pre>

              <a
                href={issue.githubUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-5 inline-flex items-center gap-2 rounded-sm bg-emerald-500 px-4 py-2 text-sm font-bold text-zinc-950 transition-colors hover:bg-emerald-400"
              >
                <ExternalLink className="h-4 w-4" />
                View on GitHub
              </a>
            </div>

            <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-5">
              <div className="mb-4 flex items-center justify-between gap-4">
                <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
                  Comments
                </h2>
                <a
                  href={issue.githubUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-bold text-emerald-400 hover:text-emerald-300"
                >
                  View all on GitHub
                </a>
              </div>

              {comments.length > 0 ? (
                <div className="space-y-3">
                  {comments.map((comment) => (
                    <article key={comment.id} className="rounded-sm border border-zinc-900 bg-zinc-900/60 p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <a
                          href={comment.author?.githubUrl ?? comment.githubUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-bold text-zinc-200 hover:text-white"
                        >
                          {comment.author?.login ?? "GitHub user"}
                        </a>
                        <span className="shrink-0 text-xs font-medium text-zinc-500">
                          {formatDate(comment.createdAt)}
                        </span>
                      </div>
                      <p className="line-clamp-6 whitespace-pre-wrap text-sm leading-6 text-zinc-400">
                        {comment.body || "No comment body provided."}
                      </p>
                      <a
                        href={comment.githubUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex text-xs font-bold text-emerald-400 hover:text-emerald-300"
                      >
                        Open comment
                      </a>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="text-sm font-medium text-zinc-500">
                  {issue.commentCount > 0
                    ? "Recent comments are unavailable here right now."
                    : "No comments yet."}
                </p>
              )}
            </div>
          </section>

          <aside className="space-y-6">
            <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-5">
              <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-zinc-400">
                Match score
              </h2>
              <p className={`mb-5 text-5xl font-bold ${scoreTone(match?.score ?? 0)}`}>
                {match ? `${matchScore}%` : "N/A"}
              </p>
              {match ? (
                <div className="space-y-4">
                  <ProgressRow label="Skill" value={match.skillSim} />
                  <ProgressRow label="Interest" value={match.interestSim} />
                  <ProgressRow label="Difficulty" value={match.diffScore} />
                </div>
              ) : (
                <p className="text-sm font-medium text-zinc-500">No match score found.</p>
              )}
            </div>

            <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-5">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-zinc-400">
                Similar Issues
              </h2>
              {similarIssues.length > 0 ? (
                <div className="space-y-3">
                  {similarIssues.map((similarIssue) => (
                    <a
                      key={similarIssue.id}
                      href={`/issues/${similarIssue.id}`}
                      className="block rounded-sm border border-zinc-800 bg-zinc-900 p-3 transition-colors hover:border-zinc-700"
                    >
                      <div className="mb-2 flex flex-wrap gap-2">
                        {similarIssue.issueType && (
                          <span className="rounded-sm border border-zinc-800 bg-zinc-950 px-1.5 py-0.5 text-[10px] font-bold text-zinc-400">
                            {titleCase(similarIssue.issueType)}
                          </span>
                        )}
                        {similarIssue.difficulty && (
                          <span className="rounded-sm border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-bold text-sky-300">
                            {titleCase(similarIssue.difficulty)}
                          </span>
                        )}
                      </div>
                      <h3 className="line-clamp-2 text-sm font-bold leading-5 text-zinc-200">
                        {similarIssue.title}
                      </h3>
                      {similarIssue.aiSummary && (
                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-500">
                          {similarIssue.aiSummary}
                        </p>
                      )}
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-sm font-medium text-zinc-500">No similar issues found.</p>
              )}
            </div>

            <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-5">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-zinc-400">
                Required Skills
              </h2>
              <div className="flex flex-wrap gap-2">
                {issue.requiredSkills.map((skill) => (
                  // TODO: Highlight skills matched to the user's profile when the API returns per-skill match data.
                  <span key={skill} className="rounded-sm border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs font-medium text-zinc-300">
                    {skill}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-5">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-zinc-400">
                Maintainer
              </h2>
              <p className="mb-3 text-base font-bold text-zinc-100">
                {issue.repo.owner}/{issue.repo.name}
              </p>
              <div className="space-y-2 text-sm font-medium text-zinc-400">
                <p>Responsiveness: {percentage(issue.repo.maintainerScore)}/100</p>
                <p>Activity: {percentage(issue.repo.activityScore)}/100</p>
              </div>
            </div>

            <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-5">
              <p className="mb-4 text-sm font-medium text-zinc-400">
                {workersCount} developer{workersCount === 1 ? "" : "s"} working on this
              </p>
              <button
                type="button"
                onClick={() => workingMutation.mutate()}
                disabled={workingMutation.isPending}
                className={`inline-flex w-full items-center justify-center gap-2 rounded-sm px-4 py-2 text-sm font-bold transition-colors disabled:opacity-60 ${
                  isWorking
                    ? "bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
                    : "border border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700 hover:text-white"
                }`}
              >
                {workingMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {isWorking ? "✓ I'm on this" : "I'm working on this"}
              </button>
            </div>
          </aside>
        </div>
      </div>
    </section>
    </AppShell>
  );
}
