"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  Clock,
  GitPullRequest,
  ThumbsDown,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { DashboardFilterSelect, DashboardMultiSelect } from "@/components/dashboard/DashboardFilterSelect";
import { apiGet, apiJson } from "@/lib/api-client";
import { isLanguageSkill, skillIdentity } from "@/lib/skills";

type Difficulty = "beginner" | "intermediate" | "advanced";
type IssueType = "bug" | "feature" | "docs" | "refactor";
type SortOrder = "desc" | "asc";

type UserSkill = {
  name: string;
  level: "strong" | "moderate" | "learning";
};

type FeedMatch = {
  id: string;
  score: number;
  skillSim: number;
  interestSim: number;
  diffScore: number;
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
  filters?: {
    languages: string[];
  };
  status?: {
    lastMatchedAt: string | null;
  };
  matches: FeedMatch[];
  reason?: "profile_incomplete";
};

type SkillsResponse = {
  skills: UserSkill[];
};

const DIFFICULTIES: Difficulty[] = ["beginner", "intermediate", "advanced"];
const ISSUE_TYPES: IssueType[] = ["bug", "feature", "docs", "refactor"];
const TECH_LOGOS: Record<string, { src: string; invert?: boolean }> = {
  javascript: {
    src: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/javascript/javascript-original.svg",
  },
  typescript: {
    src: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/typescript/typescript-original.svg",
  },
  react: {
    src: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/react/react-original.svg",
  },
  "next.js": {
    src: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/nextjs/nextjs-original.svg",
    invert: true,
  },
  nextjs: {
    src: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/nextjs/nextjs-original.svg",
    invert: true,
  },
  node: {
    src: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/nodejs/nodejs-original.svg",
  },
  "node.js": {
    src: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/nodejs/nodejs-original.svg",
  },
  python: {
    src: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/python/python-original.svg",
  },
  go: {
    src: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/go/go-original.svg",
  },
  rust: {
    src: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/rust/rust-original.svg",
    invert: true,
  },
  java: {
    src: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/java/java-original.svg",
  },
  vue: {
    src: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/vuejs/vuejs-original.svg",
  },
  svelte: {
    src: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/svelte/svelte-original.svg",
  },
};

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatLastMatched(value: string | null | undefined) {
  if (!value) return "Not matched yet";

  const matchedAt = new Date(value).getTime();
  if (Number.isNaN(matchedAt)) return "Match status unavailable";

  const diffSeconds = Math.max(0, Math.floor((Date.now() - matchedAt) / 1000));
  if (diffSeconds < 60) return "Last matched just now";

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `Last matched ${diffMinutes} min ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `Last matched ${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `Last matched ${diffDays}d ago`;

  return `Last matched ${new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(value))}`;
}

function techLogoFor(name: string) {
  return TECH_LOGOS[name.trim().toLowerCase()];
}

function TechChip({ name }: { name: string }) {
  const logo = techLogoFor(name);

  return (
    <span className="inline-flex h-9 items-center justify-center gap-2 rounded-sm bg-zinc-900 px-3 text-xs font-medium text-zinc-300">
      {logo && (
        <span
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 bg-contain bg-center bg-no-repeat ${logo.invert ? "invert" : ""}`}
          style={{ backgroundImage: `url(${logo.src})` }}
        />
      )}
      <span className="leading-none">{name}</span>
    </span>
  );
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [delayMs, value]);

  return debounced;
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

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M12 2C6.48 2 2 6.58 2 12.24c0 4.52 2.87 8.35 6.84 9.71.5.1.68-.22.68-.49 0-.24-.01-1.04-.01-1.89-2.78.62-3.37-1.22-3.37-1.22-.45-1.19-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.35 1.12 2.92.85.09-.66.35-1.12.63-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.35 9.35 0 0 1 12 6.95c.85 0 1.7.12 2.5.34 1.9-1.33 2.74-1.05 2.74-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.8 0 .27.18.59.69.49A10.07 10.07 0 0 0 22 12.24C22 6.58 17.52 2 12 2Z" />
    </svg>
  );
}

function RecommendedIssueSkeleton() {
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
  languages,
  sort,
}: {
  difficulty?: Difficulty;
  issueType?: IssueType;
  languages: string[];
  sort: SortOrder;
}) {
  const params = new URLSearchParams({ sort });
  if (difficulty) params.set("difficulty", difficulty);
  if (issueType) params.set("issueType", issueType);
  for (const language of languages) params.append("language", language);

  return apiGet<FeedResponse>(`/api/feed?${params.toString()}`, "Failed to load feed");
}

async function fetchSkills() {
  return apiGet<SkillsResponse>("/api/skills", "Failed to load skills");
}

function buildMatchReasons(match: FeedMatch, userSkills: UserSkill[]) {
  const userSkillById = new Map(userSkills.map((skill) => [skillIdentity(skill.name), skill]));
  const userSkillIds = new Set(userSkillById.keys());
  const userLanguageIds = new Set(
    userSkills.filter((skill) => isLanguageSkill(skill.name)).map((skill) => skillIdentity(skill.name))
  );
  const matchedSkills = match.issue.requiredSkills
    .filter((skill) => userSkillIds.has(skillIdentity(skill)))
    .slice(0, 3);
  const reasons: string[] = [];

  if (matchedSkills.length > 0) {
    const skillDetails = matchedSkills
      .map((skill) => {
        const userSkill = userSkillById.get(skillIdentity(skill));
        return userSkill ? `${skill} (${titleCase(userSkill.level)})` : skill;
      })
      .join(", ");
    reasons.push(`Uses your ${skillDetails} skill${matchedSkills.length > 1 ? "s" : ""}`);
  } else if (match.skillSim >= 0.65) {
    reasons.push(`Skill profile similarity is ${Math.round(match.skillSim * 100)}%`);
  }

  if (match.issue.repo.language && userLanguageIds.has(skillIdentity(match.issue.repo.language))) {
    reasons.push(`${match.issue.repo.name} is primarily ${match.issue.repo.language}`);
  }

  if (match.issue.issueType && match.interestSim > 0) {
    reasons.push(`${titleCase(match.issue.issueType)} work matches your interests`);
  } else if (match.interestSim > 0) {
    reasons.push(`Interest match is ${Math.round(match.interestSim * 100)}%`);
  }

  if (match.diffScore >= 0.75 && match.issue.difficulty) {
    const timeEstimate =
      match.issue.estimatedHours !== null ? `, about ${match.issue.estimatedHours}h` : "";
    reasons.push(`${titleCase(match.issue.difficulty)} difficulty fits your profile${timeEstimate}`);
  }

  if (match.issue.repo.maintainerScore >= 0.7) {
    reasons.push(`${match.issue.repo.owner} usually responds quickly`);
  }

  return reasons.slice(0, 3);
}

function FeedRecoveryState({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-8 text-center">
      <h3 className="text-base font-bold text-zinc-100">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-500">{detail}</p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/skills"
          className="inline-flex h-11 items-center justify-center rounded-sm bg-emerald-500 px-5 text-sm font-bold text-zinc-950 transition-colors hover:bg-emerald-400"
        >
          Update skills
        </Link>
        <Link
          href="/preferences"
          className="inline-flex h-11 items-center justify-center rounded-sm border border-zinc-800 bg-zinc-900 px-5 text-sm font-bold text-zinc-200 transition-colors hover:border-zinc-700 hover:text-white"
        >
          Preferences
        </Link>
      </div>
    </div>
  );
}

function RecommendedIssueCard({
  match,
  userSkills,
  onDismiss,
  onRestore,
}: {
  match: FeedMatch;
  userSkills: UserSkill[];
  onDismiss: (issueId: string) => void;
  onRestore: (issueId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [bookmarked, setBookmarked] = useState(match.issue.bookmarked);
  const [dismissed, setDismissed] = useState(false);
  const percent = Math.round(match.score * 100);
  const logoUrl = `https://github.com/${match.issue.repo.owner}.png`;
  const responsiveness = responsivenessTone(match.issue.repo.maintainerScore);
  const matchReasons = buildMatchReasons(match, userSkills);

  const bookmarkMutation = useMutation({
    mutationFn: async (nextBookmarked: boolean) => {
      await apiJson("/api/bookmarks", {
        method: nextBookmarked ? "POST" : "DELETE",
        body: { issueId: match.issue.id },
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
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
    },
  });

  const feedbackMutation = useMutation({
    mutationFn: async () => {
      if (dismissed) return;

      await apiJson("/api/feedback", {
        body: { issueId: match.issue.id, type: "not_interested" },
        fallbackMessage: "Failed to dismiss issue",
      });
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

  const workingMutation = useMutation({
    mutationFn: async () => {
      return apiJson<{ working: boolean }>(`/api/issues/${match.issue.id}/working`, {
        fallbackMessage: "Failed to mark issue as working",
      });
    },
    onSuccess: (payload) => {
      if (payload.working) {
        onDismiss(match.issue.id);
      }
      queryClient.invalidateQueries({ queryKey: ["working"] });
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
    },
  });

  return (
    <article className="rounded-sm border border-zinc-800 bg-zinc-950 p-5 transition-colors hover:border-zinc-700">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className="h-14 w-14 shrink-0 rounded-sm border border-zinc-800 bg-zinc-900 bg-cover bg-center"
            style={{ backgroundImage: `url(${logoUrl})` }}
            aria-label={`${match.issue.repo.owner} logo`}
          />
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-white">
              <Link
                href={`/projects/${match.issue.repo.id}`}
                className="truncate rounded-sm border border-zinc-800 bg-zinc-900 px-2 py-1 text-white hover:border-zinc-700"
                title={match.issue.repo.owner}
              >
                {match.issue.repo.owner}
              </Link>
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

      {matchReasons.length > 0 && (
        <div className="mb-5 rounded-sm border border-zinc-900 bg-zinc-900/40 p-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-400">
            Why this match
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {matchReasons.map((reason) => (
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
          {match.issue.requiredSkills.slice(0, 3).map((skill) => (
            <TechChip key={skill} name={skill} />
          ))}
          <Link
            href={`/projects/${match.issue.repo.id}`}
            className="inline-flex h-9 items-center justify-center rounded-sm bg-emerald-500 px-4 text-sm font-bold text-zinc-950 shadow-sm shadow-emerald-950/40 transition-colors hover:bg-emerald-400"
          >
            View Project
          </Link>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => workingMutation.mutate()}
            disabled={workingMutation.isPending}
            className="rounded-sm border border-emerald-500/30 bg-emerald-500/10 p-2 text-emerald-300 transition-colors hover:border-emerald-400/50 hover:bg-emerald-500/15 disabled:opacity-50"
            aria-label="Mark as working"
            title="Working on this"
          >
            <CheckCircle2 className="h-4 w-4" />
          </button>
          <a
            href={match.issue.githubUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 w-9 items-center justify-center rounded-sm border border-zinc-800 bg-zinc-900 p-2 text-zinc-400 transition-colors hover:border-zinc-700 hover:text-white"
            aria-label="Open issue on GitHub"
            title="Open on GitHub"
          >
            <GitHubMark className="h-4 w-4" />
          </a>
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

export function RecommendedIssues() {
  const [difficulty, setDifficulty] = useState<Difficulty | undefined>();
  const [issueType, setIssueType] = useState<IssueType | undefined>();
  const [languages, setLanguages] = useState<string[]>([]);
  const [sort, setSort] = useState<SortOrder>("desc");
  const [dismissedIssueIds, setDismissedIssueIds] = useState<Set<string>>(() => new Set());
  const debouncedLanguages = useDebouncedValue(languages, 300);

  const skillsQuery = useQuery({
    queryKey: ["me-skills"],
    queryFn: fetchSkills,
  });

  const feedQuery = useQuery({
    queryKey: ["feed", { difficulty, issueType, languages: debouncedLanguages, sort }],
    queryFn: () => fetchFeed({ difficulty, issueType, languages: debouncedLanguages, sort }),
    placeholderData: keepPreviousData,
  });
  const languageOptions = feedQuery.data?.filters?.languages ?? [];
  const visibleMatches =
    feedQuery.data?.matches.filter((match) => !dismissedIssueIds.has(match.issue.id)) ?? [];
  const hasActiveFilters = Boolean(difficulty || issueType || languages.length > 0);
  const matchStatusLabel = feedQuery.isLoading
    ? "Checking match status"
    : formatLastMatched(feedQuery.data?.status?.lastMatchedAt);

  return (
    <section className="space-y-3 pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white">Matched repos</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-300">
            Issues ranked from your skills, interests, and contribution history.
          </p>
        </div>
        <div className="inline-flex h-9 w-fit items-center gap-2 rounded-sm border border-emerald-500/20 bg-emerald-500/10 px-3 text-xs font-medium text-emerald-300">
          <Clock className="h-3.5 w-3.5" />
          {matchStatusLabel}
        </div>
      </div>

      <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex flex-wrap gap-3">
            <DashboardFilterSelect
              label="Difficulty"
              value={difficulty ?? ""}
              onChange={(value) => setDifficulty(value || undefined)}
              options={[
                { value: "", label: "All difficulty" },
                ...DIFFICULTIES.map((value) => ({ value, label: titleCase(value) })),
              ]}
            />

            <DashboardFilterSelect
              label="Type"
              value={issueType ?? ""}
              onChange={(value) => setIssueType(value || undefined)}
              options={[
                { value: "", label: "All types" },
                ...ISSUE_TYPES.map((value) => ({ value, label: titleCase(value) })),
              ]}
            />

            <DashboardMultiSelect
              label="Languages"
              options={languageOptions}
              value={languages}
              onChange={setLanguages}
              placeholder="All languages"
              searchPlaceholder="Search language"
            />
          </div>

          <DashboardFilterSelect
            label="Sort"
            value={sort}
            onChange={(value) => setSort((value || "desc") as SortOrder)}
            options={[
              { value: "desc", label: "Best match" },
              { value: "asc", label: "Lowest match" },
            ]}
          />
        </div>
      </div>

      {feedQuery.isLoading && (
        <div className="custom-scrollbar h-[calc(100vh-315px)] min-h-[520px] space-y-4 overflow-y-auto pr-2">
          {[1, 2, 3].map((item) => (
            <RecommendedIssueSkeleton key={item} />
          ))}
        </div>
      )}

      {feedQuery.isError && (
        <FeedRecoveryState
          title="Feed could not be loaded"
          detail="The matcher or cache may be temporarily unavailable. Refresh the feed, or adjust your skills and preferences if this keeps happening."
        />
      )}

      {feedQuery.data?.matches.length === 0 && (
        <FeedRecoveryState
          title={feedQuery.data.reason === "profile_incomplete" ? "Finish your matching profile" : "No strong matches yet"}
          detail={
            feedQuery.data.reason === "profile_incomplete"
              ? "Complete your skills, interests, and time commitment so ContribIQ can rank issues for you."
              : hasActiveFilters
                ? "Your current filters may be too narrow. Broaden them or refresh after updating your skills."
                : "Update your skills, check preferences, or refresh after more issues are classified and rescored."
          }
        />
      )}

      {feedQuery.data && feedQuery.data.matches.length > 0 && visibleMatches.length === 0 && (
        <FeedRecoveryState
          title="No visible recommendations left"
          detail="You have dismissed or started every issue in this view. Refresh the feed or broaden the filters to bring more options back."
        />
      )}

      {visibleMatches.length > 0 && (
        <div
          className="custom-scrollbar h-[calc(100vh-315px)] min-h-[520px] space-y-4 overflow-y-auto pr-2"
          aria-label="Recommended issues"
        >
          {visibleMatches.map((match) => (
            <RecommendedIssueCard
              key={match.id}
              match={match}
              userSkills={skillsQuery.data?.skills ?? []}
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
    </section>
  );
}
