"use client";

import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/app/app-shell";
import { Activity, Flame, GitCommit, GitPullRequest, Star } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

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
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}`);
  return (await response.json()) as T;
}

function formatReach(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return value.toString();
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
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

export function ContributionsPage() {
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

  const contributions = [
    ...(contributionsQuery.data?.contributions ?? []),
    ...extraContributions,
  ];
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

  const username = meQuery.data?.username ?? "developer";

  async function copyProfile() {
    await navigator.clipboard.writeText(`https://devcollab.app/${username}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        <section className="flex flex-col gap-3 border-b border-zinc-900 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-500">
              Contribution Activity
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-100">
              GitHub impact
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
              Activity combines your GitHub contribution calendar with PRs captured by ContribIQ.
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
                value={statsQuery.data?.totalContributions ?? statsQuery.data?.totalPRs ?? 0}
                label="Total Activity"
                detail={`${statsQuery.data?.githubCommits ?? 0} commits`}
                icon={Activity}
              />
              <StatCard
                value={statsQuery.data?.totalPRs ?? 0}
                label="Pull Requests"
                detail={`${statsQuery.data?.reposCount ?? 0} repos`}
                icon={GitPullRequest}
              />
              <StatCard
                value={`${statsQuery.data?.currentStreak ?? 0} days`}
                label="Current Streak"
                detail={`${statsQuery.data?.longestStreak ?? 0} longest`}
                icon={Flame}
              />
              <StatCard
                value={formatReach(statsQuery.data?.totalReach ?? 0)}
                label="Combined Reach"
                detail="curated repo stars"
                icon={Star}
              />
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-zinc-100">Activity calendar</h2>
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
            <div className="custom-scrollbar overflow-x-auto rounded-sm border border-zinc-800 bg-zinc-950 p-4">
              <div className="flex min-w-max gap-[3px]">
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
          <h2 className="text-sm font-bold text-zinc-100">Merged Pull Requests</h2>

          {contributionsQuery.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((item) => (
                <div key={item} className="h-28 animate-pulse rounded-sm bg-zinc-800" />
              ))}
            </div>
          ) : contributions.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-sm border border-zinc-800 bg-zinc-950 p-10 text-center">
              <GitPullRequest className="h-10 w-10 text-zinc-700" />
              <p className="mt-4 text-sm font-medium text-zinc-500">No merged PRs yet</p>
              <p className="mt-1 text-xs text-zinc-600">
                Merge your first PR in an open-source repo and it will appear here automatically.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {contributions.map((contribution) => {
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
                    className="space-y-3 rounded-sm border border-zinc-800 bg-zinc-950 p-5 transition-colors hover:border-zinc-700"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <p className="text-sm font-bold text-zinc-100">
                        {contribution.repoOwner}/{contribution.repoName}
                      </p>
                      <p className="shrink-0 text-xs font-medium text-zinc-500">
                        {formatDate(contribution.mergedAt)}
                      </p>
                    </div>

                    <h3 className="text-base font-semibold text-zinc-200">
                      {contribution.prTitle}
                    </h3>

                    {contribution.aiDescription && (
                      <p className="text-sm italic leading-6 text-zinc-400">
                        {contribution.aiDescription}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {contribution.skillsDemonstrated.map((skill) => (
                        <span
                          key={skill}
                          className="inline-flex rounded-full border border-emerald-800 bg-emerald-900/40 px-2 py-0.5 text-[11px] font-medium text-emerald-400"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>

                    {stats.length > 0 && (
                      <div className="flex flex-wrap gap-3 text-xs text-zinc-500">
                        {stats.map((stat) => (
                          <span key={stat}>{stat}</span>
                        ))}
                      </div>
                    )}

                    <div className="flex justify-end">
                      <a
                        href={contribution.prUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-bold text-emerald-400 hover:text-emerald-300"
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
              <div ref={sentinelRef} className="h-1" />
            </div>
          )}
        </section>

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
      </div>
    </AppShell>
  );
}
