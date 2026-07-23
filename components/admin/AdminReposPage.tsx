"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ErrorState,
  IndexingStatus,
  LoadingState,
  PageHeader,
  StatusBadge,
  formatDate,
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
  repos: RepoRow[];
  pagination: { page: number; pageSize: number; total: number; hasNextPage: boolean };
};

const STATUS_FILTERS = ["ALL", "FAILED", "PENDING", "INDEXED", "NOT_INDEXED"] as const;

async function fetchRepos(page: number, status: string) {
  const params = new URLSearchParams({ page: String(page), pageSize: "10" });
  if (status !== "ALL") params.set("status", status);
  const response = await fetch(`/api/admin/repos?${params}`);
  if (!response.ok) throw new Error("Failed to load repos");
  return (await response.json()) as ReposResponse;
}

async function reindexRepo(repoId: string) {
  const response = await fetch(`/api/admin/repos/${repoId}/reindex`, { method: "POST" });
  if (!response.ok) throw new Error("Failed to trigger reindex");
  return response.json();
}

export function AdminReposPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>("ALL");
  const [page, setPage] = useState(1);
  const reposQuery = useQuery({
    queryKey: ["admin", "repos", page, status],
    queryFn: () => fetchRepos(page, status),
    placeholderData: keepPreviousData,
  });
  const reindexMutation = useMutation({
    mutationFn: reindexRepo,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "repos"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
    },
  });

  function selectStatus(nextStatus: (typeof STATUS_FILTERS)[number]) {
    setStatus(nextStatus);
    setPage(1);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-6 sm:px-8 lg:px-10">
      <PageHeader title="Repos" subtitle="Indexing status and repository health across ContribIQ." />

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => selectStatus(item)}
            className={`h-9 rounded-sm border px-3 text-sm font-bold transition-colors ${
              status === item
                ? "border-emerald-500 bg-emerald-500 text-zinc-950"
                : "border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700 hover:text-white"
            }`}
          >
            {item.replace("_", " ")}
          </button>
        ))}
      </div>

      {reposQuery.isLoading ? <LoadingState label="Loading repos..." /> : null}
      {reposQuery.isError ? <ErrorState label="Repos could not be loaded." /> : null}

      {reposQuery.data ? (
        <section className="overflow-hidden rounded-sm border border-zinc-800 bg-zinc-950">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-800 text-sm">
              <thead className="bg-zinc-900/60 text-left text-xs font-bold uppercase text-zinc-400">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Stars</th>
                  <th className="px-4 py-3">Language</th>
                  <th className="px-4 py-3">Activity</th>
                  <th className="px-4 py-3">Maintainer</th>
                  <th className="px-4 py-3">Indexing</th>
                  <th className="px-4 py-3">Last indexed</th>
                  <th className="px-4 py-3">Open issues</th>
                  <th className="px-4 py-3">Chunks</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900">
                {reposQuery.data.repos.map((repo) => (
                  <tr key={repo.id} className="align-top text-zinc-200">
                    <td className="px-4 py-4 font-semibold text-white">
                      <div>{repo.fullName}</div>
                      {repo.indexingStatus === "FAILED" && repo.indexingError ? (
                        <div className="mt-2 max-w-md text-xs font-medium leading-5 text-red-300" title={repo.indexingError}>
                          {repo.indexingError}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-4">{formatNumber(repo.stars)}</td>
                    <td className="px-4 py-4">{repo.language ?? "Unknown"}</td>
                    <td className="px-4 py-4">{percent(repo.activityScore)}</td>
                    <td className="px-4 py-4">{percent(repo.maintainerScore)}</td>
                    <td className="px-4 py-4"><StatusBadge status={repo.indexingStatus} /></td>
                    <td className="px-4 py-4">{formatDate(repo.lastIndexedAt)}</td>
                    <td className="px-4 py-4">{formatNumber(repo.openIssues)}</td>
                    <td className="px-4 py-4">{formatNumber(repo.docChunks)}</td>
                    <td className="px-4 py-4 text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={reindexMutation.isPending && reindexMutation.variables === repo.id}
                        onClick={() => reindexMutation.mutate(repo.id)}
                      >
                        <RefreshCw className="h-4 w-4" />
                        Re-index
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            total={reposQuery.data.pagination.total}
            hasNextPage={reposQuery.data.pagination.hasNextPage}
            onPageChange={setPage}
          />
        </section>
      ) : null}
    </div>
  );
}

function Pagination({
  page,
  total,
  hasNextPage,
  onPageChange,
}: {
  page: number;
  total: number;
  hasNextPage: boolean;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-between border-t border-zinc-800 px-4 py-3 text-sm font-medium text-zinc-300">
      <span>{formatNumber(total)} total</span>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" disabled={page === 1} onClick={() => onPageChange(page - 1)}>
          Previous
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={!hasNextPage} onClick={() => onPageChange(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}
