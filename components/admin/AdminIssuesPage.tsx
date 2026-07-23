"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MouseEvent, RefObject } from "react";
import { ChevronDown, Check, Loader2, Sparkles, Search } from "lucide-react";
import { useDeferredValue, useEffect, useId, useRef, useState } from "react";
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

type ClassificationFilter = "ALL" | "CLASSIFIED" | "UNCLASSIFIED";
type DifficultyFilter = "ALL" | "beginner" | "intermediate" | "advanced";
type IssueTypeFilter = "ALL" | "bug" | "feature" | "docs" | "refactor";

type IssuesResponse = {
  counts: Record<"ALL" | "UNCLASSIFIED", number>;
  issues: IssueRow[];
  pagination: { page: number; pageSize: number; total: number; hasNextPage: boolean };
};

const CLASSIFICATION_OPTIONS: Array<{ value: ClassificationFilter; label: string }> = [
  { value: "ALL", label: "Issues: All" },
  { value: "CLASSIFIED", label: "Issues: Classified" },
  { value: "UNCLASSIFIED", label: "Issues: Unclassified" },
];

const DIFFICULTY_OPTIONS: Array<{ value: DifficultyFilter; label: string }> = [
  { value: "ALL", label: "Difficulty: All" },
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

const ISSUE_TYPE_OPTIONS: Array<{ value: IssueTypeFilter; label: string }> = [
  { value: "ALL", label: "Type: All" },
  { value: "bug", label: "Bug" },
  { value: "feature", label: "Feature" },
  { value: "docs", label: "Docs" },
  { value: "refactor", label: "Refactor" },
];

async function fetchIssues(
  page: number,
  classification: ClassificationFilter,
  difficulty: DifficultyFilter,
  issueType: IssueTypeFilter,
  search: string
) {
  const params = new URLSearchParams({ page: String(page), pageSize: "10" });
  if (classification === "CLASSIFIED") params.set("classified", "true");
  if (classification === "UNCLASSIFIED") params.set("classified", "false");
  if (difficulty !== "ALL") params.set("difficulty", difficulty);
  if (issueType !== "ALL") params.set("issueType", issueType);
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

function useDismissibleDetails(id: string, detailsRef: RefObject<HTMLDetailsElement | null>) {
  useEffect(() => {
    function closeOtherDropdowns(event: Event) {
      const current = event as CustomEvent<string>;
      if (current.detail !== id) detailsRef.current?.removeAttribute("open");
    }

    function closeOnOutsidePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (detailsRef.current?.contains(target)) return;

      detailsRef.current?.removeAttribute("open");
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;

      detailsRef.current?.removeAttribute("open");
      detailsRef.current?.querySelector("summary")?.blur();
    }

    window.addEventListener("admin-issue-filter-open", closeOtherDropdowns);
    document.addEventListener("pointerdown", closeOnOutsidePointerDown, true);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("admin-issue-filter-open", closeOtherDropdowns);
      document.removeEventListener("pointerdown", closeOnOutsidePointerDown, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [detailsRef, id]);
}

function FilterSelect<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  const id = useId();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const selectedOption = options.find((option) => option.value === value) ?? options[0];
  useDismissibleDetails(id, detailsRef);

  function selectOption(nextValue: T, event: MouseEvent<HTMLButtonElement>) {
    onChange(nextValue);
    detailsRef.current?.removeAttribute("open");
    event.currentTarget.blur();
  }

  return (
    <details
      ref={detailsRef}
      className="group relative w-full"
      onToggle={(event) => {
        if (event.currentTarget.open) {
          window.dispatchEvent(new CustomEvent("admin-issue-filter-open", { detail: id }));
        }
      }}
    >
      <summary
        className="flex h-11 w-full cursor-pointer list-none items-center justify-between gap-3 rounded-sm border border-zinc-800 bg-zinc-900/70 px-3 text-sm font-medium text-white outline-none transition-colors hover:border-zinc-700 focus:border-emerald-500 [&::-webkit-details-marker]:hidden"
      >
        <span className="truncate">{selectedOption.label}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500 transition-transform group-open:rotate-180" />
      </summary>
      <div className="absolute left-0 z-30 mt-2 w-full min-w-56 rounded-sm border border-zinc-800 bg-zinc-950 p-2 shadow-xl shadow-black/40">
        {options.map((option) => {
          const selected = option.value === value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={(event) => selectOption(option.value, event)}
              className={`flex h-9 w-full items-center gap-2 rounded-sm px-2.5 text-left text-sm font-medium transition-colors ${
                selected
                  ? "bg-emerald-500/10 text-white"
                  : "text-zinc-300 hover:bg-zinc-900 hover:text-white"
              }`}
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors ${
                  selected
                    ? "border-emerald-400 bg-emerald-500 text-zinc-950"
                    : "border-zinc-700 bg-zinc-950 text-transparent"
                }`}
              >
                <Check className="h-3 w-3" />
              </span>
              <span className="truncate">{option.label}</span>
            </button>
          );
        })}
      </div>
    </details>
  );
}

export function AdminIssuesPage() {
  const queryClient = useQueryClient();
  const [classification, setClassification] = useState<ClassificationFilter>("ALL");
  const [difficulty, setDifficulty] = useState<DifficultyFilter>("ALL");
  const [issueType, setIssueType] = useState<IssueTypeFilter>("ALL");
  const [search, setSearch] = useState("");
  const [classificationError, setClassificationError] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search);
  const [page, setPage] = useState(1);
  const issuesQuery = useQuery({
    queryKey: ["admin", "issues", page, classification, difficulty, issueType, deferredSearch],
    queryFn: () => fetchIssues(page, classification, difficulty, issueType, deferredSearch),
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

  function updateFilter<T>(setter: (value: T) => void, value: T) {
    setter(value);
    setPage(1);
  }

  const rows = issuesQuery.data?.issues ?? [];
  const totalPages = issuesQuery.data
    ? Math.max(1, Math.ceil(issuesQuery.data.pagination.total / issuesQuery.data.pagination.pageSize))
    : 1;

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-6 py-8 sm:px-8 lg:px-10">
      <PageHeader title="Issues" subtitle="Recently updated issue classifications and stuck unclassified work." />

      <div className="grid gap-3 lg:grid-cols-[1.35fr_1fr_1fr_1fr]">
        <div className="relative w-full">
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
        <FilterSelect
          value={classification}
          options={CLASSIFICATION_OPTIONS}
          onChange={(value) => updateFilter(setClassification, value)}
        />
        <FilterSelect
          value={difficulty}
          options={DIFFICULTY_OPTIONS}
          onChange={(value) => updateFilter(setDifficulty, value)}
        />
        <FilterSelect
          value={issueType}
          options={ISSUE_TYPE_OPTIONS}
          onChange={(value) => updateFilter(setIssueType, value)}
        />
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
