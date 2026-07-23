"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  AlertTriangle,
  Database,
  ListChecks,
  RefreshCw,
  ServerCog,
  UsersRound,
} from "lucide-react";
import {
  ErrorState,
  IndexingStatus,
  LoadingState,
  formatNumber,
} from "@/components/admin/admin-utils";

type OverviewResponse = {
  database: {
    repos: number;
    indexedRepos: number;
    failedRepos: number;
    pendingRepos: number;
    notIndexedRepos: number;
    openIssues: number;
    totalIssues: number;
    classifiedIssues: number;
    classifiedOpenIssues: number;
    repoDocChunks: number;
    users: number;
    onboardedUsers: number;
  };
  indexingStatus: Array<{ status: string; count: number }>;
};

async function fetchOverview() {
  const response = await fetch("/api/admin/overview");
  if (!response.ok) throw new Error("Failed to load admin overview");
  return (await response.json()) as OverviewResponse;
}

const STATUS_META: Record<IndexingStatus, { label: string; dot: string; bar: string }> = {
  INDEXED: { label: "Indexed", dot: "bg-emerald-400", bar: "bg-emerald-500" },
  PENDING: { label: "Pending", dot: "bg-yellow-300", bar: "bg-yellow-300" },
  FAILED: { label: "Failed", dot: "bg-red-400", bar: "bg-red-400" },
  NOT_INDEXED: { label: "Not indexed", dot: "bg-zinc-600", bar: "bg-zinc-700" },
};

function ratio(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
}

function statusCount(overview: OverviewResponse, status: IndexingStatus) {
  return overview.indexingStatus.find((item) => item.status === status)?.count ?? 0;
}

function StatCard({
  label,
  value,
  total,
  detail,
  icon: Icon,
  tone = "emerald",
}: {
  label: string;
  value: number;
  total?: number;
  detail?: string;
  icon: typeof Database;
  tone?: "emerald" | "zinc";
}) {
  const progress = total === undefined ? null : ratio(value, total);
  const toneClasses = {
    emerald: "text-emerald-400 bg-emerald-500",
    zinc: "text-zinc-100 bg-zinc-500",
  }[tone];
  const [textClass, barClass] = toneClasses.split(" ");

  return (
    <div className="rounded-sm border border-zinc-800 bg-zinc-900/60 p-4 shadow-sm shadow-black/20">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-zinc-300">{label}</p>
        <Icon className="h-4 w-4 text-zinc-500" />
      </div>
      <div className="mt-4 flex items-end gap-2">
        <span className={`text-2xl font-bold leading-none ${textClass}`}>{formatNumber(value)}</span>
        {total !== undefined ? (
          <span className="text-sm font-bold text-zinc-500">/ {formatNumber(total)}</span>
        ) : null}
      </div>
      {detail ? <p className="mt-3 text-xs font-medium text-zinc-400">{detail}</p> : null}
      {progress !== null ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-sm bg-zinc-800">
          <div className={`h-full rounded-sm ${barClass}`} style={{ width: `${progress}%` }} />
        </div>
      ) : null}
    </div>
  );
}

function OverviewShell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-7xl space-y-5 px-6 py-8 sm:px-8 lg:px-10">{children}</div>;
}

export function AdminOverviewPage() {
  const overviewQuery = useQuery({ queryKey: ["admin", "overview"], queryFn: fetchOverview });
  const overview = overviewQuery.data;

  if (overviewQuery.isLoading) {
    return (
      <OverviewShell>
        <LoadingState label="Loading admin overview..." />
      </OverviewShell>
    );
  }

  if (overviewQuery.isError || !overview) {
    return (
      <OverviewShell>
        <ErrorState label="Admin overview could not be loaded." />
      </OverviewShell>
    );
  }

  const indexed = statusCount(overview, "INDEXED");
  const pending = statusCount(overview, "PENDING");
  const failed = statusCount(overview, "FAILED");
  const notIndexed = statusCount(overview, "NOT_INDEXED");
  const unclassified = Math.max(overview.database.totalIssues - overview.database.classifiedIssues, 0);
  const indexingSegments: Array<{ status: IndexingStatus; count: number }> = [
    { status: "INDEXED", count: indexed },
    { status: "PENDING", count: pending },
    { status: "FAILED", count: failed },
    { status: "NOT_INDEXED", count: notIndexed },
  ];

  return (
    <OverviewShell>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Admin overview</h1>
          <p className="mt-2 text-sm font-semibold text-zinc-400">
            Global health, usage, and indexing status.
          </p>
        </div>
        <Link
          href="/admin/repos?status=NOT_INDEXED"
          className="inline-flex h-10 w-fit items-center justify-center gap-2 rounded-sm bg-emerald-500 px-4 text-sm font-bold text-zinc-950 transition-colors hover:bg-emerald-400"
        >
          <RefreshCw className="h-4 w-4" />
          Index remaining repos
        </Link>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Repos indexed" value={overview.database.indexedRepos} total={overview.database.repos} icon={Database} />
        <StatCard
          label="Issues classified"
          value={overview.database.classifiedIssues}
          total={overview.database.totalIssues}
          icon={ListChecks}
        />
        <StatCard label="Total users" value={overview.database.users} detail="Registered accounts" icon={UsersRound} tone="zinc" />
        <StatCard
          label="Users onboarded"
          value={overview.database.onboardedUsers}
          total={overview.database.users}
          icon={UsersRound}
        />
      </section>

      <section className="rounded-sm border border-zinc-800 bg-zinc-900/60 p-5">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-bold text-white">Indexing breakdown</h2>
          <span className="text-sm font-bold text-zinc-500">{formatNumber(overview.database.repos)} repos total</span>
        </div>
        <div className="flex h-4 overflow-hidden rounded-sm bg-zinc-950">
          {indexingSegments.map((segment) =>
            segment.count > 0 ? (
              <div
                key={segment.status}
                className={STATUS_META[segment.status].bar}
                style={{ width: `${ratio(segment.count, overview.database.repos)}%` }}
                title={`${STATUS_META[segment.status].label}: ${segment.count}`}
              />
            ) : null
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
          {indexingSegments.map((segment) => (
            <div key={segment.status} className="flex items-center gap-2 text-sm font-bold text-zinc-300">
              <span className={`h-2 w-2 rounded-full ${STATUS_META[segment.status].dot}`} />
              {STATUS_META[segment.status].label} · {formatNumber(segment.count)}
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
        <div className="rounded-sm border border-emerald-500/20 bg-emerald-500/10 p-5">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
            <div>
              <h2 className="text-lg font-bold text-emerald-300">
                {formatNumber(notIndexed)} repos still need indexing
              </h2>
              <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-emerald-100/80">
                These repos will not support project docs Q&A until the docs ingestion worker indexes them.
              </p>
              <Link
                href="/admin/repos?status=NOT_INDEXED"
                className="mt-4 inline-flex h-10 items-center justify-center rounded-sm bg-emerald-500 px-4 text-sm font-bold text-zinc-950 transition-colors hover:bg-emerald-400"
              >
                View unindexed repos
              </Link>
            </div>
          </div>
        </div>

        <div className="rounded-sm border border-zinc-800 bg-zinc-900/60 p-5">
          <h2 className="text-lg font-bold text-white">Quick actions</h2>
          <div className="mt-4 grid gap-2">
            <Link
              href="/admin/issues?classified=false"
              className="flex h-11 items-center gap-3 rounded-sm border border-zinc-700 bg-zinc-950 px-4 text-sm font-bold text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white"
            >
              <ListChecks className="h-4 w-4 text-zinc-400" />
              Review unclassified issues ({formatNumber(unclassified)})
            </Link>
            <Link
              href="/admin/repos?status=FAILED"
              className="flex h-11 items-center gap-3 rounded-sm border border-zinc-700 bg-zinc-950 px-4 text-sm font-bold text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white"
            >
              <ServerCog className="h-4 w-4 text-zinc-400" />
              Inspect failed indexes ({formatNumber(failed)})
            </Link>
            <Link
              href="/admin/users"
              className="flex h-11 items-center gap-3 rounded-sm border border-zinc-700 bg-zinc-950 px-4 text-sm font-bold text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white"
            >
              <UsersRound className="h-4 w-4 text-zinc-400" />
              View all users
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-sm border border-zinc-800 bg-zinc-900/40 p-4">
          <p className="text-sm font-bold text-zinc-300">Open issues</p>
          <p className="mt-3 text-2xl font-bold text-white">{formatNumber(overview.database.openIssues)}</p>
        </div>
        <div className="rounded-sm border border-zinc-800 bg-zinc-900/40 p-4">
          <p className="text-sm font-bold text-zinc-300">Open classified</p>
          <p className="mt-3 text-2xl font-bold text-white">{formatNumber(overview.database.classifiedOpenIssues)}</p>
        </div>
        <div className="rounded-sm border border-zinc-800 bg-zinc-900/40 p-4">
          <p className="text-sm font-bold text-zinc-300">Doc chunks</p>
          <p className="mt-3 text-2xl font-bold text-white">{formatNumber(overview.database.repoDocChunks)}</p>
        </div>
      </section>
    </OverviewShell>
  );
}
