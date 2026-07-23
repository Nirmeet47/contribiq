"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Circle, Clock3, RefreshCw, Search, XCircle } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { Button } from "@/components/ui/button";
import { PaginationControls } from "@/components/ui/pagination-controls";
import {
  ErrorState,
  IndexingStatus,
  LoadingState,
  PageHeader,
  StatusBadge,
  formatNumber,
  percent,
} from "@/components/admin/admin-utils";

type RepoRow = {
  id: string;
  fullName: string;
  stars: number;
  language: string | null;
  activityScore: number;
  maintainerScore: number;
  indexingStatus: IndexingStatus;
  lastIndexedAt: string | null;
  indexingError: string | null;
  openIssues: number;
  docChunks: number;
};

type ReposResponse = {
  counts: Record<(typeof STATUS_FILTERS)[number], number>;
  repos: RepoRow[];
  pagination: { page: number; pageSize: number; total: number; hasNextPage: boolean };
};

const STATUS_FILTERS = ["ALL", "FAILED", "PENDING", "INDEXED", "NOT_INDEXED"] as const;
const FILTER_META: Record<(typeof STATUS_FILTERS)[number], { label: string; dot: string; icon?: typeof Circle }> = {
  ALL: { label: "All", dot: "bg-blue-400" },
  FAILED: { label: "Failed", dot: "bg-red-400", icon: XCircle },
  PENDING: { label: "Pending", dot: "bg-yellow-300", icon: Clock3 },
  INDEXED: { label: "Indexed", dot: "bg-emerald-400", icon: CheckCircle2 },
  NOT_INDEXED: { label: "Not indexed", dot: "bg-zinc-500", icon: Circle },
};

function indexingDetail(repo: RepoRow) {
  if (repo.indexingStatus === "INDEXED") return `${formatNumber(repo.docChunks)} chunks`;
  if (repo.indexingStatus === "PENDING") return "Queued for indexing";
  if (repo.indexingStatus === "FAILED") return "Needs retry";
  return null;
}

async function fetchRepos(page: number, status: string, search: string) {
  const params = new URLSearchParams({ page: String(page), pageSize: "10" });
  if (status !== "ALL") params.set("status", status);
  if (search.trim()) params.set("q", search.trim());
  const response = await fetch(`/api/admin/repos?${params}`);
  if (!response.ok) throw new Error("Failed to load repos");
  return (await response.json()) as ReposResponse;
}

async function reindexRepo(repoId: string) {
  const response = await fetch(`/api/admin/repos/${repoId}/reindex`, { method: "POST" });
  if (!response.ok) throw new Error("Failed to trigger reindex");
  return response.json();
}

async function reindexAllNotIndexed() {
  const response = await fetch("/api/admin/repos", { method: "POST" });
  if (!response.ok) throw new Error("Failed to queue not-indexed repos");
  return response.json() as Promise<{ queued: number }>;
}

export function AdminReposPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>("ALL");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [page, setPage] = useState(1);
  const reposQuery = useQuery({
    queryKey: ["admin", "repos", page, status, deferredSearch],
    queryFn: () => fetchRepos(page, status, deferredSearch),
    placeholderData: keepPreviousData,
  });
  const reindexMutation = useMutation({
    mutationFn: reindexRepo,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "repos"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
    },
  });
  const reindexAllMutation = useMutation({
    mutationFn: reindexAllNotIndexed,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "repos"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
    },
  });

  function selectStatus(nextStatus: (typeof STATUS_FILTERS)[number]) {
    setStatus(nextStatus);
    setPage(1);
  }

  const counts = reposQuery.data?.counts;
  const visibleRows = reposQuery.data?.repos ?? [];
  const totalPages = reposQuery.data
    ? Math.max(1, Math.ceil(reposQuery.data.pagination.total / reposQuery.data.pagination.pageSize))
    : 1;

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-6 py-8 sm:px-8 lg:px-10">
      <PageHeader title="Repos" subtitle="Indexing status and repository health across ContribIQ." />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search repos"
            className="h-11 w-full rounded-sm border border-zinc-800 bg-zinc-900/70 pl-10 pr-3 text-sm font-medium text-white outline-none transition-colors placeholder:text-zinc-500 focus:border-emerald-500"
          />
        </div>

        <Button
          type="button"
          className="h-11 w-full bg-emerald-500 text-zinc-950 hover:bg-emerald-400 lg:w-fit"
          disabled={reindexAllMutation.isPending || (counts?.NOT_INDEXED ?? 0) === 0}
          onClick={() => reindexAllMutation.mutate()}
        >
          <RefreshCw className="h-4 w-4" />
          Re-index all not-indexed ({formatNumber(counts?.NOT_INDEXED ?? 0)})
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => selectStatus(item)}
            className={`h-9 rounded-sm border px-3 text-sm font-medium transition-colors ${
              status === item
                ? "border-emerald-500 bg-emerald-500 text-zinc-950"
                : "border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700 hover:text-white"
            }`}
          >
            <span className="inline-flex items-center gap-2">
              {item !== "ALL" ? <span className={`h-2 w-2 rounded-full ${FILTER_META[item].dot}`} /> : null}
              {FILTER_META[item].label} - {formatNumber(counts?.[item] ?? 0)}
            </span>
          </button>
        ))}
      </div>

      {reposQuery.isLoading ? <LoadingState label="Loading repos..." /> : null}
      {reposQuery.isError ? <ErrorState label="Repos could not be loaded." /> : null}

      {reposQuery.data ? (
        <section className="overflow-hidden rounded-sm border border-zinc-800 bg-zinc-950 shadow-sm shadow-black/20">
          <div className="overflow-x-auto">
            <table className="min-w-[980px] table-fixed divide-y divide-zinc-800 text-sm">
              <colgroup>
                <col className="w-[29%]" />
                <col className="w-[12%]" />
                <col className="w-[14%]" />
                <col className="w-[12%]" />
                <col className="w-[16%]" />
                <col className="w-[9%]" />
                <col className="w-[8%]" />
              </colgroup>
              <thead className="bg-zinc-900/80 text-left text-xs font-medium uppercase text-zinc-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Stars</th>
                  <th className="px-4 py-3">Language</th>
                  <th className="px-4 py-3">Maintainer</th>
                  <th className="px-4 py-3">Indexing</th>
                  <th className="px-4 py-3">Open issues</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {visibleRows.map((repo) => {
                  const detail = indexingDetail(repo);

                  return (
                    <tr key={repo.id} className="h-[66px] align-middle text-zinc-200 odd:bg-zinc-950 even:bg-zinc-900/70">
                      <td className="px-4 py-4 font-medium text-white">
                        <div className="truncate" title={repo.fullName}>{repo.fullName}</div>
                        {repo.indexingStatus === "FAILED" && repo.indexingError ? (
                          <div className="mt-2 flex max-w-md items-start gap-1.5 text-xs font-medium leading-5 text-red-400" title={repo.indexingError}>
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span className="line-clamp-2">{repo.indexingError}</span>
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-4 font-medium">{formatNumber(repo.stars)}</td>
                      <td className="px-4 py-4 font-medium">
                        <span className="block truncate" title={repo.language ?? "Unknown"}>
                          {repo.language ?? "Unknown"}
                        </span>
                      </td>
                      <td className={`px-4 py-4 font-medium ${repo.maintainerScore >= 0.8 ? "text-emerald-400" : repo.maintainerScore >= 0.5 ? "text-yellow-300" : "text-red-400"}`}>
                        {percent(repo.maintainerScore)}
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-1.5">
                          <StatusBadge status={repo.indexingStatus} />
                          <div className="h-4 truncate text-xs font-medium text-zinc-500">
                            {detail ?? ""}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 font-medium">{formatNumber(repo.openIssues)}</td>
                      <td className="px-4 py-4 text-right">
                        <Button
                          type="button"
                          size="default"
                          variant="outline"
                          disabled={reindexMutation.isPending && reindexMutation.variables === repo.id}
                          onClick={() => reindexMutation.mutate(repo.id)}
                          className={`h-10 min-w-28 whitespace-nowrap ${
                            repo.indexingStatus === "FAILED"
                              ? "border-red-500/40 text-red-400 hover:border-red-500/60 hover:text-red-300"
                              : ""
                          }`}
                        >
                          <RefreshCw className="h-4 w-4" />
                          {repo.indexingStatus === "FAILED" ? "Retry" : "Re-index"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="h-[660px] px-4 py-10 text-center text-sm font-medium text-zinc-400">
                      No repos match this view.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="px-4 pb-5">
            <PaginationControls
              page={page}
              totalPages={totalPages}
              hasPreviousPage={page > 1}
              hasNextPage={reposQuery.data.pagination.hasNextPage}
              onPageChange={setPage}
              label={`${formatNumber(reposQuery.data.pagination.total)} repos - page`}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
