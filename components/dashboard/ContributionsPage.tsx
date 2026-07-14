"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, CalendarDays, Flame, GitCommit, GitPullRequest } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiGet } from "@/lib/api-client";

type Contribution = {
  id: string;
  repoOwner: string;
  repoName: string;
  prNumber: number;
  prTitle: string;
  prUrl: string;
  mergedAt: string;
  aiDescription: string | null;
  skillsDemonstrated: string[];
  complexity: number | null;
  linesAdded: number | null;
  linesRemoved: number | null;
  filesChanged: number | null;
};

type ContributionsResponse = {
  contributions: Contribution[];
  nextCursor: string | null;
};

type Stats = {
  source?: "github" | "local";
  totalContributions?: number;
  totalPRs: number;
  githubCommits?: number | null;
  currentStreak?: number;
  reposCount: number;
  longestStreak: number;
  totalReach: number;
};

type HeatmapCell = {
  date: string;
  count: number;
  avgComplexity: number;
  snippet: string | null;
  source?: "github" | "local";
};

type MeResponse = {
  username?: string | null;
};

async function fetchJson<T>(url: string) {
  return apiGet<T>(url, `Failed to fetch ${url}`);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function monthLabel(value: Date) {
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
  }).format(value);
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function heatColor(cell: HeatmapCell | undefined) {
  if (!cell) return "bg-zinc-800";
  if (cell.count <= 1) return "bg-emerald-950";
  if (cell.count <= 3) return "bg-emerald-800";
  if (cell.count <= 6) return "bg-emerald-600";
  return "bg-emerald-400";
}

function isSameMonth(value: string, month: Date) {
  const date = new Date(value);
  return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
}

function StatCard({
  value,
  label,
  detail,
  icon: Icon,
}: {
  value: string | number;
  label: string;
  detail?: string;
  icon: typeof Activity;
}) {
  return (
    <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-5">
      <Icon className="mb-4 h-4 w-4 text-zinc-500" />
      <p className="text-3xl font-bold text-zinc-100">{value}</p>
      <p className="mt-2 text-xs font-medium text-zinc-500">{label}</p>
      {detail && <p className="mt-1 text-[11px] font-medium text-zinc-600">{detail}</p>}
    </div>
  );
}

export function ContributionsPage({
  embedded = false,
  mode = "full",
  initialContributions = [],
}: {
  embedded?: boolean;
  mode?: "full" | "summary" | "details";
  initialContributions?: Contribution[];
}) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [extraContributions, setExtraContributions] = useState<Contribution[]>([]);
  const [paginationCursor, setPaginationCursor] = useState<string | null | undefined>();
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [copied, setCopied] = useState(false);

  const contributionsQuery = useQuery({
    queryKey: ["contributions"],
    queryFn: () => fetchJson<ContributionsResponse>("/api/contributions"),
  });

  const statsQuery = useQuery({
    queryKey: ["contributions-stats"],
    queryFn: () => fetchJson<Stats>("/api/contributions/stats"),
  });

  const heatmapQuery = useQuery({
    queryKey: ["contributions-heatmap"],
    queryFn: () => fetchJson<{ heatmap: HeatmapCell[]; source?: "github" | "local" }>("/api/contributions/heatmap"),
  });

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => fetchJson<MeResponse>("/api/me"),
  });

  const apiContributions = contributionsQuery.data?.contributions;
  const baseContributions =
    apiContributions && apiContributions.length > 0 ? apiContributions : initialContributions;
  const contributionsById = new Map(
    [...baseContributions, ...extraContributions].map((contribution) => [
      contribution.id,
      contribution,
    ])
  );
  const contributions = Array.from(contributionsById.values());
  const currentMonth = useMemo(() => new Date(), []);
  const currentMonthLabel = monthLabel(currentMonth);
  const monthlyContributions = contributions
    .filter((contribution) => isSameMonth(contribution.mergedAt, currentMonth))
    .sort((a, b) => new Date(b.mergedAt).getTime() - new Date(a.mergedAt).getTime());
  const nextCursor =
    paginationCursor === undefined
      ? contributionsQuery.data?.nextCursor ?? null
      : paginationCursor;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting || !nextCursor || isFetchingMore) return;

      setIsFetchingMore(true);
      try {
        const page = await fetchJson<ContributionsResponse>(
          `/api/contributions?cursor=${encodeURIComponent(nextCursor)}`
        );
        setExtraContributions((current) => [...current, ...page.contributions]);
        setPaginationCursor(page.nextCursor);
      } finally {
        setIsFetchingMore(false);
      }
    });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [isFetchingMore, nextCursor]);

  const heatmapByDate = useMemo(() => {
    return new Map(
      (heatmapQuery.data?.heatmap ?? []).map((cell) => [cell.date, cell])
    );
  }, [heatmapQuery.data]);

  const heatmapWeeks = useMemo(() => {
    const today = new Date();
    const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    start.setUTCDate(start.getUTCDate() - 363);

    return Array.from({ length: 52 }, (_, weekIndex) =>
      Array.from({ length: 7 }, (_, dayIndex) => {
        const date = addDays(start, weekIndex * 7 + dayIndex);
        const key = dateKey(date);
        return { date: key, cell: heatmapByDate.get(key) };
      })
    );
  }, [heatmapByDate]);

  const currentMonthActivityDays = useMemo(() => {
    return (heatmapQuery.data?.heatmap ?? []).filter(
      (cell) => cell.count > 0 && isSameMonth(cell.date, currentMonth)
    ).length;
  }, [currentMonth, heatmapQuery.data?.heatmap]);
  const username = meQuery.data?.username ?? "developer";
  const showSummary = mode === "full" || mode === "summary";
  const showDetails = mode === "full" || mode === "details";

  async function copyProfile() {
    await navigator.clipboard.writeText(`https://devcollab.app/${username}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={embedded ? "space-y-10" : "mx-auto max-w-6xl space-y-10 px-6 py-8"}>
      {showSummary && (
        <>
        <section className="flex flex-col gap-3 border-b border-zinc-900 pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            {embedded ? (
              <h2 className="text-3xl font-bold tracking-tight text-zinc-100">
                GitHub activity
              </h2>
            ) : (
              <h1 className="text-3xl font-bold tracking-tight text-zinc-100">
                GitHub activity
              </h1>
            )}
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-500">
              Month-focused GitHub contribution activity and PRs processed by ContribIQ.
            </p>
          </div>
          <span className="w-fit rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-bold text-zinc-400">
            {statsQuery.data?.source === "github" ? "GitHub synced" : "Local fallback"}
          </span>
        </section>
        <section>
          {statsQuery.isLoading ? (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[1, 2, 3, 4].map((item) => (
                <div key={item} className="h-24 animate-pulse rounded-sm bg-zinc-800" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard
                value={monthlyContributions.length}
                label={`${currentMonthLabel} PRs`}
                detail="merged this month"
                icon={GitPullRequest}
              />
              <StatCard
                value={currentMonthActivityDays}
                label="Active Days"
                detail={currentMonthLabel}
                icon={CalendarDays}
              />
              <StatCard
                value={`${statsQuery.data?.currentStreak ?? 0} days`}
                label="Current Streak"
                detail={`${statsQuery.data?.longestStreak ?? 0} longest`}
                icon={Flame}
              />
              <StatCard
                value={statsQuery.data?.totalContributions ?? statsQuery.data?.totalPRs ?? 0}
                label="Total Activity"
                detail={`${statsQuery.data?.githubCommits ?? 0} commits synced`}
                icon={Activity}
              />
            </div>
          )}
        </section>
        </>
      )}

      {showDetails && (
        <>
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-zinc-100">Activity calendar</h2>
              <p className="mt-1 text-xs font-medium text-zinc-500">
                {heatmapQuery.data?.source === "github"
                  ? "Synced from your GitHub contribution calendar."
                  : "Showing locally tracked merged PR activity."}
              </p>
            </div>
            <div className="hidden items-center gap-1 text-[10px] font-medium text-zinc-600 sm:flex">
              <span>Less</span>
              <span className="h-3 w-3 rounded-sm bg-zinc-800" />
              <span className="h-3 w-3 rounded-sm bg-emerald-950" />
              <span className="h-3 w-3 rounded-sm bg-emerald-800" />
              <span className="h-3 w-3 rounded-sm bg-emerald-600" />
              <span className="h-3 w-3 rounded-sm bg-emerald-400" />
              <span>More</span>
            </div>
          </div>
          {heatmapQuery.isLoading ? (
            <div className="h-24 w-full animate-pulse rounded-sm bg-zinc-800" />
          ) : heatmapQuery.data?.heatmap.length === 0 ? (
            <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-8 text-center">
              <GitCommit className="mx-auto h-8 w-8 text-zinc-700" />
              <p className="mt-3 text-sm font-medium text-zinc-500">
                No contribution activity found for the last year.
              </p>
            </div>
          ) : (
            <div className="custom-scrollbar max-w-full overflow-x-auto border-y border-zinc-900 py-4">
              <div className="mx-auto flex w-max gap-[3px] align-top">
                {heatmapWeeks.map((week, weekIndex) => (
                  <div key={weekIndex} className="flex flex-col gap-[3px]">
                    {week.map(({ date, cell }) => (
                      <div
                        key={date}
                        className={`h-3 w-3 rounded-sm ${heatColor(cell)}`}
                        title={
                          cell
                            ? `${cell.count} contribution(s) on ${date}\n${cell.snippet ?? ""}`
                            : `0 contribution(s) on ${date}`
                        }
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-zinc-100">
              PRs merged in {currentMonthLabel}
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Only pull requests merged during the current month are shown here.
            </p>
          </div>

          {contributionsQuery.isLoading && initialContributions.length === 0 ? (
            <div className="space-y-3">
              {[1, 2, 3].map((item) => (
                <div key={item} className="h-28 animate-pulse rounded-sm bg-zinc-800" />
              ))}
            </div>
          ) : monthlyContributions.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-sm border border-zinc-800 bg-zinc-950 p-10 text-center">
              <GitPullRequest className="h-10 w-10 text-zinc-700" />
              <p className="mt-4 text-sm font-medium text-zinc-500">
                No PRs merged in {currentMonthLabel}
              </p>
              <p className="mt-1 text-xs text-zinc-600">
                Older PRs are kept out of this monthly view so the section stays focused.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden border-y border-zinc-800">
              {monthlyContributions.map((contribution) => {
                const stats = [
                  contribution.linesAdded !== null && contribution.linesRemoved !== null
                    ? `+${contribution.linesAdded} / -${contribution.linesRemoved} lines`
                    : null,
                  contribution.filesChanged !== null
                    ? `${contribution.filesChanged} files`
                    : null,
                  contribution.complexity !== null
                    ? `complexity ${contribution.complexity}/5`
                    : null,
                ].filter(Boolean);

                return (
                  <article
                    key={contribution.id}
                    className="relative border-b border-zinc-900 py-4 pl-4 transition-colors last:border-b-0 hover:bg-zinc-950/70"
                  >
                    <span className="absolute left-0 top-6 h-2 w-2 rounded-full bg-emerald-400" />
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-medium">
                          <span className="font-bold uppercase tracking-wide text-emerald-400">
                            {formatDate(contribution.mergedAt)}
                          </span>
                          <span className="text-zinc-600">PR #{contribution.prNumber}</span>
                          <span className="rounded-sm border border-purple-500/40 bg-purple-500/10 px-2 py-0.5 font-bold text-purple-300">
                            Merged
                          </span>
                          <span className="min-w-0 truncate text-zinc-500">
                            {contribution.repoOwner}/{contribution.repoName}
                          </span>
                        </div>

                        <h3 className="mt-2 text-base font-semibold leading-6 text-zinc-100">
                          {contribution.prTitle}
                        </h3>

                        {contribution.aiDescription && (
                          <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-400">
                            {contribution.aiDescription}
                          </p>
                        )}

                        {(contribution.skillsDemonstrated.length > 0 || stats.length > 0) && (
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            {contribution.skillsDemonstrated.slice(0, 3).map((skill) => (
                              <span
                                key={skill}
                                className="inline-flex rounded-sm border border-emerald-800 bg-emerald-900/40 px-2 py-0.5 text-[11px] font-medium text-emerald-400"
                              >
                                {skill}
                              </span>
                            ))}
                            {stats.map((stat) => (
                              <span key={stat} className="text-xs text-zinc-500">
                                {stat}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <a
                        href={contribution.prUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-9 shrink-0 items-center justify-center rounded-sm border border-zinc-800 px-3 text-xs font-bold text-emerald-400 transition-colors hover:border-emerald-500/40 hover:text-emerald-300"
                      >
                        View PR
                      </a>
                    </div>
                  </article>
                );
              })}

              {isFetchingMore && (
                <div className="h-20 animate-pulse rounded-sm bg-zinc-800" />
              )}
            </div>
          )}
          <div ref={sentinelRef} className="h-1" />
        </section>

        {!embedded && (
          <section className="flex flex-col gap-4 rounded-sm border border-zinc-800 bg-zinc-900/60 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm text-zinc-400">Your public profile:</p>
              <p className="text-sm font-mono text-emerald-400">devcollab.app/{username}</p>
            </div>
            <button
              type="button"
              onClick={copyProfile}
              className="rounded-sm border border-zinc-700 px-3 py-2 text-xs font-bold text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </section>
        )}
        </>
      )}
    </div>
  );
}
