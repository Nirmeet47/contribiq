"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BoolBadge, ErrorState, LoadingState, PageHeader, formatDate, formatNumber } from "@/components/admin/admin-utils";

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

type IssuesResponse = {
  issues: IssueRow[];
  pagination: { page: number; pageSize: number; total: number; hasNextPage: boolean };
};

async function fetchIssues(page: number, classified: "all" | "false") {
  const params = new URLSearchParams({ page: String(page), pageSize: "10" });
  if (classified === "false") params.set("classified", "false");
  const response = await fetch(`/api/admin/issues?${params}`);
  if (!response.ok) throw new Error("Failed to load issues");
  return (await response.json()) as IssuesResponse;
}

export function AdminIssuesPage() {
  const [classified, setClassified] = useState<"all" | "false">("all");
  const [page, setPage] = useState(1);
  const issuesQuery = useQuery({
    queryKey: ["admin", "issues", page, classified],
    queryFn: () => fetchIssues(page, classified),
    placeholderData: keepPreviousData,
  });

  function setFilter(next: "all" | "false") {
    setClassified(next);
    setPage(1);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-6 sm:px-8 lg:px-10">
      <PageHeader title="Issues" subtitle="Recently updated issue classifications and stuck unclassified work." />

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setFilter("all")} className={filterClass(classified === "all")}>All</button>
        <button type="button" onClick={() => setFilter("false")} className={filterClass(classified === "false")}>Unclassified</button>
      </div>

      {issuesQuery.isLoading ? <LoadingState label="Loading issues..." /> : null}
      {issuesQuery.isError ? <ErrorState label="Issues could not be loaded." /> : null}

      {issuesQuery.data ? (
        <section className="overflow-hidden rounded-sm border border-zinc-800 bg-zinc-950">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-800 text-sm">
              <thead className="bg-zinc-900/60 text-left text-xs font-bold uppercase text-zinc-400">
                <tr>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Repo</th>
                  <th className="px-4 py-3">Difficulty</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Classified</th>
                  <th className="px-4 py-3">Last updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900">
                {issuesQuery.data.issues.map((issue) => (
                  <tr key={issue.id} className="align-top text-zinc-200">
                    <td className="max-w-xl px-4 py-4">
                      <div className="font-semibold text-white">{issue.title}</div>
                      {issue.aiSummary ? <div className="mt-2 line-clamp-2 text-xs font-medium leading-5 text-zinc-400">{issue.aiSummary}</div> : null}
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-medium text-white">{issue.repo.fullName}</div>
                      <div className="mt-1 text-xs text-zinc-500">{issue.repoId}</div>
                    </td>
                    <td className="px-4 py-4">{issue.difficulty ? <Badge variant="secondary">{issue.difficulty}</Badge> : "None"}</td>
                    <td className="px-4 py-4">{issue.issueType ? <Badge variant="outline">{issue.issueType}</Badge> : "None"}</td>
                    <td className="px-4 py-4"><BoolBadge value={issue.classified} /></td>
                    <td className="px-4 py-4">{formatDate(issue.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} total={issuesQuery.data.pagination.total} hasNextPage={issuesQuery.data.pagination.hasNextPage} onPageChange={setPage} />
        </section>
      ) : null}
    </div>
  );
}

function filterClass(active: boolean) {
  return `h-9 rounded-sm border px-3 text-sm font-bold transition-colors ${
    active
      ? "border-emerald-500 bg-emerald-500 text-zinc-950"
      : "border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700 hover:text-white"
  }`;
}

function Pagination({ page, total, hasNextPage, onPageChange }: { page: number; total: number; hasNextPage: boolean; onPageChange: (page: number) => void }) {
  return (
    <div className="flex items-center justify-between border-t border-zinc-800 px-4 py-3 text-sm font-medium text-zinc-300">
      <span>{formatNumber(total)} total</span>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" disabled={page === 1} onClick={() => onPageChange(page - 1)}>Previous</Button>
        <Button type="button" size="sm" variant="outline" disabled={!hasNextPage} onClick={() => onPageChange(page + 1)}>Next</Button>
      </div>
    </div>
  );
}
