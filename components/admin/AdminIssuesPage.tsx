"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles, Search } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PaginationControls } from "@/components/ui/pagination-controls";
import {
  BoolBadge,
  ErrorState,
  LoadingState,
  PageHeader,
  formatDate,
  formatNumber,
} from "@/components/admin/admin-utils";

type IssueRow = {
  id: string;
  title: string;
  repoId: string;
  difficulty: string | null;
  issueType: string | null;
  aiSummary: string | null;
  classified: boolean;
  updatedAt: string;
  repo: { fullName: string };
};

type IssueFilter = "ALL" | "UNCLASSIFIED";

type IssuesResponse = {
  counts: Record<IssueFilter, number>;
  issues: IssueRow[];
  pagination: { page: number; pageSize: number; total: number; hasNextPage: boolean };
};

const FILTERS: Array<{ value: IssueFilter; label: string; dot?: string }> = [
  { value: "ALL", label: "All" },
  { value: "UNCLASSIFIED", label: "Unclassified", dot: "bg-yellow-300" },
];

async function fetchIssues(page: number, filter: IssueFilter, search: string) {
  const params = new URLSearchParams({ page: String(page), pageSize: "10" });
  if (filter === "UNCLASSIFIED") params.set("classified", "false");
  if (search.trim()) params.set("q", search.trim());
  const response = await fetch(`/api/admin/issues?${params}`);
  if (!response.ok) throw new Error("Failed to load issues");
  return (await response.json()) as IssuesResponse;
}

async function classifyIssue(issueId: string) {
  const response = await fetch(`/api/admin/issues/${issueId}/classify`, { method: "POST" });
  const payload = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(payload?.error || "Failed to classify issue");
  return payload;
}

export function AdminIssuesPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<IssueFilter>("ALL");
  const [search, setSearch] = useState("");
  const [classificationError, setClassificationError] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search);
  const [page, setPage] = useState(1);
  const issuesQuery = useQuery({
    queryKey: ["admin", "issues", page, filter, deferredSearch],
    queryFn: () => fetchIssues(page, filter, deferredSearch),
    placeholderData: keepPreviousData,
  });
  const classifyMutation = useMutation({
    mutationFn: classifyIssue,
    onMutate: () => setClassificationError(null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "issues"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
    },
    onError: (error) => {
      setClassificationError(error instanceof Error ? error.message : "Issue could not be classified.");
    },
  });

  function selectFilter(next: IssueFilter) {
    setFilter(next);
    setPage(1);
  }

  const rows = issuesQuery.data?.issues ?? [];
  const counts = issuesQuery.data?.counts;
  const totalPages = issuesQuery.data
    ? Math.max(1, Math.ceil(issuesQuery.data.pagination.total / issuesQuery.data.pagination.pageSize))
    : 1;

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-6 py-8 sm:px-8 lg:px-10">
      <PageHeader title="Issues" subtitle="Recently updated issue classifications and stuck unclassified work." />

      <div className="relative w-full lg:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Search issues"
          className="h-11 w-full rounded-sm border border-zinc-800 bg-zinc-900/70 pl-10 pr-3 text-sm font-medium text-white outline-none transition-colors placeholder:text-zinc-500 focus:border-emerald-500"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => selectFilter(item.value)}
            className={`h-9 rounded-sm border px-3 text-sm font-medium transition-colors ${
              filter === item.value
                ? "border-emerald-500 bg-emerald-500 text-zinc-950"
                : "border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700 hover:text-white"
            }`}
          >
            <span className="inline-flex items-center gap-2">
              {item.dot ? <span className={`h-2 w-2 rounded-full ${item.dot}`} /> : null}
              {item.label} - {formatNumber(counts?.[item.value] ?? 0)}
            </span>
          </button>
        ))}
      </div>

      {issuesQuery.isLoading ? <LoadingState label="Loading issues..." /> : null}
      {issuesQuery.isError ? <ErrorState label="Issues could not be loaded." /> : null}
      {classificationError ? <ErrorState label={classificationError} /> : null}

      {issuesQuery.data ? (
        <section className="overflow-hidden rounded-sm border border-zinc-800 bg-zinc-950 shadow-sm shadow-black/20">
          <div className="overflow-x-auto">
            <table className="w-full table-fixed divide-y divide-zinc-800 text-sm">
              <colgroup>
                <col className="w-[31%]" />
                <col className="w-[17%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[12%]" />
                <col className="w-[10%]" />
              </colgroup>
              <thead className="bg-zinc-900/80 text-left text-xs font-medium uppercase text-zinc-500">
                <tr>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Repo</th>
                  <th className="px-4 py-3">Difficulty</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Classified</th>
                  <th className="px-4 py-3">Updated</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {rows.map((issue) => (
                  <tr key={issue.id} className="h-[66px] align-middle text-zinc-200 odd:bg-zinc-950 even:bg-zinc-900/70">
                    <td className="min-w-0 px-4 py-4 font-medium text-white">
                      <div className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap" title={issue.title}>
                        {issue.title}
                      </div>
                    </td>
                    <td className="px-4 py-4 font-medium">
                      <div className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-white" title={issue.repo.fullName}>
                        {issue.repo.fullName}
                      </div>
                    </td>
                    <td className="px-4 py-4">{issue.difficulty ? <Badge variant="secondary">{issue.difficulty}</Badge> : <span className="text-zinc-500">None</span>}</td>
                    <td className="px-4 py-4">{issue.issueType ? <Badge variant="outline">{issue.issueType}</Badge> : <span className="text-zinc-500">None</span>}</td>
                    <td className="px-4 py-4"><BoolBadge value={issue.classified} /></td>
                    <td className="whitespace-nowrap px-4 py-4 font-medium text-zinc-300">{formatDate(issue.updatedAt)}</td>
                    <td className="px-4 py-4 text-right">
                      {issue.classified ? (
                        <span className="text-sm font-medium text-zinc-500">Ready</span>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={classifyMutation.isPending}
                          onClick={() => classifyMutation.mutate(issue.id)}
                          className="h-9 min-w-0 gap-1.5 whitespace-nowrap px-3 text-xs font-medium border-emerald-500/40 text-emerald-300 hover:border-emerald-500/70 hover:text-emerald-200"
                        >
                          {classifyMutation.isPending && classifyMutation.variables === issue.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Sparkles className="h-4 w-4" />
                          )}
                          Classify
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm font-medium text-zinc-400">
                      No issues match this view.
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
              hasNextPage={issuesQuery.data.pagination.hasNextPage}
              onPageChange={setPage}
              label={`${formatNumber(issuesQuery.data.pagination.total)} issues - page`}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
