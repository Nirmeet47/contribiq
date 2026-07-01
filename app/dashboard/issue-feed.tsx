"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bookmark,
  BookmarkCheck,
  Clock,
  GitPullRequest,
  ThumbsDown,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

type Difficulty = "beginner" | "intermediate" | "advanced";
type IssueType = "bug" | "feature" | "docs" | "refactor";
type SortOrder = "desc" | "asc";

type FeedMatch = {
  id: string;
  score: number;
  issue: {
    id: string;
    title: string;
    aiSummary: string | null;
    difficulty: Difficulty | null;
    estimatedHours: number | null;
    issueType: IssueType | null;
    githubUrl: string;
    requiredSkills: string[];
    bookmarked: boolean;
    repo: {
      id: string;
      owner: string;
      name: string;
      fullName: string;
      maintainerScore: number;
      language: string | null;
    };
  };
};

type FeedResponse = {
  matches: FeedMatch[];
  reason?: "profile_incomplete";
};

const DIFFICULTIES: Difficulty[] = ["beginner", "intermediate", "advanced"];
const ISSUE_TYPES: IssueType[] = ["bug", "feature", "docs", "refactor"];

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function scoreTone(score: number) {
  if (score >= 0.8) return "border-emerald-500/40 bg-emerald-500/15 text-emerald-300";
  if (score >= 0.6) return "border-amber-500/40 bg-amber-500/15 text-amber-300";
  return "border-zinc-700 bg-zinc-900 text-zinc-300";
}

function maintainerLabel(score: number) {
  if (score >= 0.75) return "Highly responsive";
  if (score >= 0.45) return "Responsive";
  return "Emerging";
}

function responsivenessTone(score: number) {
  if (score >= 0.7) {
    return {
      label: "Fast response (~1-2 days)",
      className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    };
  }
  if (score >= 0.4) {
    return {
      label: "Moderate response (~1 week)",
      className: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    };
  }
  return {
    label: "Slow response (2+ weeks)",
    className: "border-zinc-700 bg-zinc-900 text-zinc-300",
  };
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-sm border border-zinc-800 bg-zinc-950 p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="h-10 w-10 shrink-0 rounded-sm bg-zinc-800" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-40 rounded-sm bg-zinc-800" />
            <div className="h-5 w-3/4 rounded-sm bg-zinc-800" />
          </div>
        </div>
        <div className="h-7 w-14 rounded-sm bg-zinc-800" />
      </div>
      <div className="mb-4 space-y-2">
        <div className="h-3 w-full rounded-sm bg-zinc-800" />
        <div className="h-3 w-11/12 rounded-sm bg-zinc-800" />
        <div className="h-3 w-2/3 rounded-sm bg-zinc-800" />
      </div>
      <div className="mb-5 flex flex-wrap gap-2">
        <div className="h-7 w-20 rounded-sm bg-zinc-800" />
        <div className="h-7 w-14 rounded-sm bg-zinc-800" />
        <div className="h-7 w-24 rounded-sm bg-zinc-800" />
        <div className="h-7 w-36 rounded-sm bg-zinc-800" />
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-zinc-900 pt-4">
        <div className="flex gap-2">
          <div className="h-6 w-16 rounded-sm bg-zinc-800" />
          <div className="h-6 w-20 rounded-sm bg-zinc-800" />
          <div className="h-6 w-14 rounded-sm bg-zinc-800" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-9 rounded-sm bg-zinc-800" />
          <div className="h-9 w-9 rounded-sm bg-zinc-800" />
        </div>
      </div>
    </div>
  );
}

async function fetchFeed({
  difficulty,
  issueType,
  sort,
}: {
  difficulty?: Difficulty;
  issueType?: IssueType;
  sort: SortOrder;
}) {
  const params = new URLSearchParams({ sort });
  if (difficulty) params.set("difficulty", difficulty);
  if (issueType) params.set("issueType", issueType);

  const response = await fetch(`/api/feed?${params.toString()}`);
  if (!response.ok) throw new Error("Failed to load feed");
  return (await response.json()) as FeedResponse;
}

function IssueCard({
  match,
  onDismiss,
  onRestore,
}: {
  match: FeedMatch;
  onDismiss: (issueId: string) => void;
  onRestore: (issueId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [bookmarked, setBookmarked] = useState(match.issue.bookmarked);
  const [dismissed, setDismissed] = useState(false);
  const percent = Math.round(match.score * 100);
  const logoUrl = `https://github.com/${match.issue.repo.owner}.png`;
  const responsiveness = responsivenessTone(match.issue.repo.maintainerScore);

  const bookmarkMutation = useMutation({
    mutationFn: async (nextBookmarked: boolean) => {
      const response = await fetch("/api/bookmarks", {
        method: nextBookmarked ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId: match.issue.id }),
      });
      if (!response.ok) throw new Error("Failed to update bookmark");
    },
    onMutate: (nextBookmarked) => {
      setBookmarked(nextBookmarked);
      return { previousBookmarked: bookmarked };
    },
    onError: (_error, _nextBookmarked, context) => {
      if (context) setBookmarked(context.previousBookmarked);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
    },
  });

  const feedbackMutation = useMutation({
    mutationFn: async () => {
      if (dismissed) return;

      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId: match.issue.id, type: "not_interested" }),
      });
      if (!response.ok) throw new Error("Failed to dismiss issue");
    },
    onMutate: () => {
      setDismissed(true);
      onDismiss(match.issue.id);
    },
    onError: () => {
      setDismissed(false);
      onRestore(match.issue.id);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["feed"] }),
  });

  return (
    <article className="rounded-sm border border-zinc-800 bg-zinc-950 p-5 transition-colors hover:border-zinc-700">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className="h-10 w-10 shrink-0 rounded-sm border border-zinc-800 bg-zinc-900 bg-cover bg-center"
            style={{ backgroundImage: `url(${logoUrl})` }}
            aria-label={`${match.issue.repo.owner} logo`}
          />
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-zinc-500">
              <span>{match.issue.repo.fullName}</span>
              {match.issue.repo.language && <span>{match.issue.repo.language}</span>}
            </div>
            <Link
              href={`/issues/${match.issue.id}`}
              className="group inline-flex items-start gap-2 text-base font-bold leading-6 text-zinc-100 hover:text-white"
            >
              {match.issue.title}
            </Link>
          </div>
        </div>
        <span className={`shrink-0 rounded-sm border px-2.5 py-1 text-xs font-bold ${scoreTone(match.score)}`}>
          {percent}%
        </span>
      </div>

      <p className="mb-4 line-clamp-3 text-sm leading-6 text-zinc-400">
        {match.issue.aiSummary || "No AI summary available yet."}
      </p>

      <div className="mb-5 flex flex-wrap gap-2">
        {match.issue.difficulty && (
          <span className="rounded-sm border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-xs font-bold text-sky-300">
            {titleCase(match.issue.difficulty)}
          </span>
        )}
        {match.issue.estimatedHours !== null && (
          <span className="inline-flex items-center gap-1 rounded-sm border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs font-medium text-zinc-300">
            <Clock className="h-3 w-3" />
            {match.issue.estimatedHours}h
          </span>
        )}
        {match.issue.issueType && (
          <span className="inline-flex items-center gap-1 rounded-sm border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs font-medium text-zinc-300">
            <GitPullRequest className="h-3 w-3" />
            {titleCase(match.issue.issueType)}
          </span>
        )}
        <span className={`rounded-sm border px-2 py-1 text-xs font-medium ${responsiveness.className}`}>
          {responsiveness.label}
        </span>
        <span className="rounded-sm border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-300">
          {maintainerLabel(match.issue.repo.maintainerScore)}
        </span>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-zinc-900 pt-4">
        <div className="flex min-w-0 flex-wrap gap-2">
          {match.issue.requiredSkills.slice(0, 3).map((skill) => (
            <span key={skill} className="rounded-sm bg-zinc-900 px-2 py-1 text-[11px] font-medium text-zinc-500">
              {skill}
            </span>
          ))}
          <Link
            href={`/projects/${match.issue.repo.id}`}
            className="inline-flex items-center justify-center rounded-sm bg-emerald-500 px-4 py-2 text-sm font-bold text-zinc-950 shadow-sm shadow-emerald-950/40 transition-colors hover:bg-emerald-400"
          >
            View Project
          </Link>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => bookmarkMutation.mutate(!bookmarked)}
            disabled={bookmarkMutation.isPending}
            className="rounded-sm border border-zinc-800 bg-zinc-900 p-2 text-zinc-400 transition-colors hover:border-zinc-700 hover:text-white disabled:opacity-50"
            aria-label={bookmarked ? "Remove bookmark" : "Bookmark issue"}
            title={bookmarked ? "Remove bookmark" : "Bookmark"}
          >
            {bookmarked ? <BookmarkCheck className="h-4 w-4 text-emerald-400" /> : <Bookmark className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => feedbackMutation.mutate()}
            disabled={feedbackMutation.isPending || dismissed}
            className="rounded-sm border border-zinc-800 bg-zinc-900 p-2 text-zinc-400 transition-colors hover:border-zinc-700 hover:text-white disabled:opacity-50"
            aria-label={dismissed ? "Issue dismissed" : "Not interested"}
            title={dismissed ? "Issue dismissed" : "Not interested"}
          >
            <ThumbsDown className="h-4 w-4" />
          </button>
        </div>
      </div>
    </article>
  );
}

export function IssueFeed() {
  const [difficulty, setDifficulty] = useState<Difficulty | undefined>();
  const [issueType, setIssueType] = useState<IssueType | undefined>();
  const [sort, setSort] = useState<SortOrder>("desc");
  const [dismissedIssueIds, setDismissedIssueIds] = useState<Set<string>>(() => new Set());

  const feedQuery = useQuery({
    queryKey: ["feed", { difficulty, issueType, sort }],
    queryFn: () => fetchFeed({ difficulty, issueType, sort }),
  });
  const visibleMatches =
    feedQuery.data?.matches.filter((match) => !dismissedIssueIds.has(match.issue.id)) ?? [];

  return (
    <div className="space-y-5">
      <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setDifficulty(undefined)}
              className={`rounded-sm border px-3 py-1.5 text-xs font-bold transition-colors ${!difficulty ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white"}`}
            >
              All difficulty
            </button>
            {DIFFICULTIES.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setDifficulty(value)}
                className={`rounded-sm border px-3 py-1.5 text-xs font-bold transition-colors ${difficulty === value ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white"}`}
              >
                {titleCase(value)}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setIssueType(undefined)}
              className={`rounded-sm border px-3 py-1.5 text-xs font-bold transition-colors ${!issueType ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white"}`}
            >
              All types
            </button>
            {ISSUE_TYPES.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setIssueType(value)}
                className={`rounded-sm border px-3 py-1.5 text-xs font-bold transition-colors ${issueType === value ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white"}`}
              >
                {titleCase(value)}
              </button>
            ))}
          </div>

          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortOrder)}
            className="h-9 rounded-sm border border-zinc-800 bg-zinc-900 px-3 text-xs font-bold text-zinc-300 outline-none transition-colors hover:border-zinc-700"
            aria-label="Sort feed"
          >
            <option value="desc">Best match</option>
            <option value="asc">Lowest match</option>
          </select>
        </div>
      </div>

      {feedQuery.isLoading && (
        <div className="custom-scrollbar h-[calc(100vh-245px)] min-h-[520px] space-y-4 overflow-y-auto pr-2">
          {[1, 2, 3].map((item) => (
            <SkeletonCard key={item} />
          ))}
        </div>
      )}

      {feedQuery.isError && (
        <div className="rounded-sm border border-red-500/30 bg-red-500/10 p-4 text-sm font-medium text-red-300">
          Feed could not be loaded.
        </div>
      )}

      {feedQuery.data?.matches.length === 0 && (
        <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-8 text-center text-sm font-medium text-zinc-500">
          {feedQuery.data.reason === "profile_incomplete"
            ? "Complete your skills, interests, and time commitment so matches can be personalized."
            : "No strong matches yet. Update your skills or wait for more issues to be classified and rescored."}
        </div>
      )}

      {feedQuery.data && feedQuery.data.matches.length > 0 && visibleMatches.length === 0 && (
        <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-8 text-center text-sm font-medium text-zinc-500">
          No visible recommendations left in this view.
        </div>
      )}

      {visibleMatches.length > 0 && (
        <div
          className="custom-scrollbar h-[calc(100vh-245px)] min-h-[520px] space-y-4 overflow-y-auto pr-2"
          aria-label="Recommended issues"
        >
          {visibleMatches.map((match) => (
            <IssueCard
              key={match.id}
              match={match}
              onDismiss={(issueId) =>
                setDismissedIssueIds((current) => new Set(current).add(issueId))
              }
              onRestore={(issueId) =>
                setDismissedIssueIds((current) => {
                  const next = new Set(current);
                  next.delete(issueId);
                  return next;
                })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
