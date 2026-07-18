"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { IssueLoadingSkeleton } from "@/components/issues/IssueLoadingSkeleton";
import { IssueMainContent } from "@/components/issues/IssueMainContent";
import { IssueSidebar } from "@/components/issues/IssueSidebar";
import type { IssueDetailResponse } from "@/components/issues/types";

async function fetchIssue(issueId: string) {
  const response = await fetch(`/api/issues/${issueId}`);
  if (!response.ok) throw new Error("Failed to load issue");
  return (await response.json()) as IssueDetailResponse;
}

async function toggleWorking(issueId: string) {
  const response = await fetch(`/api/issues/${issueId}/working`, {
    method: "POST",
  });
  if (!response.ok) throw new Error("Failed to update working state");
  return (await response.json()) as { working: boolean };
}

export function IssueDetailPage({ issueId }: { issueId: string }) {
  const queryClient = useQueryClient();

  const issueQuery = useQuery({
    queryKey: ["issue", issueId],
    queryFn: () => fetchIssue(issueId),
  });

  const workingMutation = useMutation({
    mutationFn: () => toggleWorking(issueId),
    onSuccess: (data) => {
      queryClient.setQueryData<IssueDetailResponse>(["issue", issueId], (current) => {
        if (!current) return current;

        const nextWorkersCount =
          data.working === current.isWorking
            ? current.workersCount
            : Math.max(0, current.workersCount + (data.working ? 1 : -1));

        return {
          ...current,
          isWorking: data.working,
          workersCount: nextWorkersCount,
        };
      });
      queryClient.invalidateQueries({ queryKey: ["issue", issueId] });
    },
  });

  if (issueQuery.isLoading) {
    return <IssueLoadingSkeleton />;
  }

  if (issueQuery.isError || !issueQuery.data) {
    return (
      <section className="flex min-h-screen items-center justify-center p-6 text-zinc-50">
        <div className="w-full max-w-md rounded-sm border border-red-500/30 bg-red-500/10 p-5 text-center">
          <p className="mb-4 text-sm font-medium text-red-300">Issue could not be loaded.</p>
          <button
            type="button"
            onClick={() => issueQuery.refetch()}
            className="inline-flex items-center gap-2 rounded-sm bg-white px-4 py-2 text-sm font-bold text-zinc-950 transition-colors hover:bg-zinc-200"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
        </div>
      </section>
    );
  }

  const { issue, match, similarIssues, comments, workersCount, isWorking } = issueQuery.data;

  return (
    <section className="p-6 text-zinc-50 sm:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="space-y-2">
          <p className="text-sm font-bold uppercase tracking-widest text-emerald-400">
            {issue.repo.owner}/{issue.repo.name}
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-white">{issue.title}</h1>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <IssueMainContent issue={issue} comments={comments} />
          <IssueSidebar
            issue={issue}
            match={match}
            similarIssues={similarIssues}
            workersCount={workersCount}
            isWorking={isWorking}
            workingMutation={workingMutation}
          />
        </div>
      </div>
    </section>
  );
}
