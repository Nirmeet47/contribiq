"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bookmark,
  BookmarkCheck,
  Clock,
  ExternalLink,
  GitPullRequest,
  ThumbsDown,
} from "lucide-react";
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

function IssueCard({ match }: { match: FeedMatch }) {
  const queryClient = useQueryClient();
  const percent = Math.round(match.score * 100);
  const logoUrl = `https://github.com/${match.issue.repo.owner}.png`;

  const bookmarkMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/bookmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId: match.issue.id }),
      });
      if (!response.ok) throw new Error("Failed to bookmark issue");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["feed"] }),
  });

  const feedbackMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId: match.issue.id, type: "not_interested" }),
      });
      if (!response.ok) throw new Error("Failed to dismiss issue");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["feed"] }),
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
            <a
              href={match.issue.githubUrl}
              target="_blank"
              rel="noreferrer"
              className="group inline-flex items-start gap-2 text-base font-bold leading-6 text-zinc-100 hover:text-white"
            >
              {match.issue.title}
              <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 text-zinc-600 transition-colors group-hover:text-zinc-300" />
            </a>
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
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => bookmarkMutation.mutate()}
            disabled={bookmarkMutation.isPending}
            className="rounded-sm border border-zinc-800 bg-zinc-900 p-2 text-zinc-400 transition-colors hover:border-zinc-700 hover:text-white disabled:opacity-50"
            aria-label="Bookmark issue"
            title="Bookmark"
          >
            {match.issue.bookmarked ? <BookmarkCheck className="h-4 w-4 text-emerald-400" /> : <Bookmark className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => feedbackMutation.mutate()}
            disabled={feedbackMutation.isPending}
            className="rounded-sm border border-zinc-800 bg-zinc-900 p-2 text-zinc-400 transition-colors hover:border-zinc-700 hover:text-white disabled:opacity-50"
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

export function IssueFeed() {
  const [difficulty, setDifficulty] = useState<Difficulty | undefined>();
  const [issueType, setIssueType] = useState<IssueType | undefined>();
  const [sort, setSort] = useState<SortOrder>("desc");

  const feedQuery = useQuery({
    queryKey: ["feed", { difficulty, issueType, sort }],
    queryFn: () => fetchFeed({ difficulty, issueType, sort }),
  });

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
        <div className="space-y-4">
          {[1, 2, 3].map((item) => (
            <div key={item} className="animate-pulse rounded-sm border border-zinc-800 bg-zinc-950 p-5">
              <div className="mb-4 h-5 w-2/3 rounded-sm bg-zinc-800" />
              <div className="space-y-2">
                <div className="h-3 w-full rounded-sm bg-zinc-900" />
                <div className="h-3 w-3/4 rounded-sm bg-zinc-900" />
              </div>
            </div>
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
          No matches yet. Run the match scoring worker after issues are classified.
        </div>
      )}

      <div className="space-y-4">
        {feedQuery.data?.matches.map((match) => (
          <IssueCard key={match.id} match={match} />
        ))}
      </div>
    </div>
  );
}
