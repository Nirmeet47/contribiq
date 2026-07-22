"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Clock, GitPullRequest, Search, Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { DashboardFilterSelect, DashboardMultiSelect } from "@/components/dashboard/DashboardFilterSelect";
import { ProjectCard } from "@/components/dashboard/ProjectsCatalogPage";
import { apiGet } from "@/lib/api-client";
import type { ProjectSummary } from "@/lib/project-serializer";

type Difficulty = "beginner" | "intermediate" | "advanced";
type IssueType = "bug" | "feature" | "docs" | "refactor";
type RepoSort = "stars" | "activityScore" | "maintainerScore";

type Issue = {
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
    activityScore: number;
    language: string | null;
    categories: string[];
  };
};

type ProjectSearchResult = Pick<
  ProjectSummary,
  "id" | "fullName" | "description" | "language" | "stars"
>;

type Pagination = {
  page: number;
  pageSize: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};
type SearchResponse = {
  issues: Issue[];
  projects: ProjectSearchResult[];
  pagination: {
    page: number;
    pageSize: number;
    issues: Pagination;
    projects: Pagination;
  };
};
type ProjectDirectoryResponse = {
  projects: ProjectSummary[];
  filters: { languages: string[] };
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

async function fetchJson<T>(url: string) {
  return apiGet<T>(url, `Failed to fetch ${url}`);
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [delayMs, value]);

  return debounced;
}

function IssueCard({ issue, badge }: { issue: Issue; badge?: string }) {
  const logoUrl = `https://github.com/${issue.repo.owner}.png`;

  return (
    <article className="rounded-sm border border-zinc-800 bg-zinc-950 p-5 transition-colors hover:border-zinc-700">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className="h-10 w-10 shrink-0 rounded-sm border border-zinc-800 bg-zinc-900 bg-cover bg-center"
            style={{ backgroundImage: `url(${logoUrl})` }}
          />
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-zinc-500">
              <span>{issue.repo.fullName}</span>
              {issue.repo.language && <span>{issue.repo.language}</span>}
            </div>
            <Link href={`/issues/${issue.id}`} className="text-base font-bold leading-6 text-zinc-100 hover:text-white">
              {issue.title}
            </Link>
          </div>
        </div>
        {badge && (
          <span className="shrink-0 rounded-sm border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs font-bold text-emerald-300">
            {badge}
          </span>
        )}
      </div>

      <p className="mb-4 line-clamp-3 text-sm leading-6 text-zinc-400">
        {issue.aiSummary || "No AI summary available yet."}
      </p>

      <div className="flex flex-wrap gap-2">
        {issue.difficulty && (
          <span className="rounded-sm border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-xs font-bold text-sky-300">
            {titleCase(issue.difficulty)}
          </span>
        )}
        {issue.estimatedHours !== null && (
          <span className="inline-flex items-center gap-1 rounded-sm border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs font-medium text-zinc-300">
            <Clock className="h-3 w-3" />
            {issue.estimatedHours}h
          </span>
        )}
        {issue.issueType && (
          <span className="inline-flex items-center gap-1 rounded-sm border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs font-medium text-zinc-300">
            <GitPullRequest className="h-3 w-3" />
            {titleCase(issue.issueType)}
          </span>
        )}
        {issue.requiredSkills.slice(0, 3).map((skill) => (
          <span key={skill} className="rounded-sm bg-zinc-900 px-2 py-1 text-[11px] font-medium text-zinc-500">
            {skill}
          </span>
        ))}
      </div>
    </article>
  );
}

function ProjectMiniCard({ project }: { project: ProjectSearchResult }) {
  return (
    <Link href={`/projects/${project.id}`} className="rounded-sm border border-zinc-800 bg-zinc-950 p-4 transition-colors hover:border-zinc-700">
      <p className="truncate text-sm font-bold text-zinc-100">{project.fullName}</p>
      <p className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-500">
        {project.description || "Curated project in the ContribIQ catalog."}
      </p>
      <div className="mt-3 flex items-center gap-3 text-xs font-medium text-zinc-500">
        <span className="inline-flex items-center gap-1">
          <Star className="h-3 w-3 text-amber-300" />
          {project.stars.toLocaleString()}
        </span>
        {project.language && <span>{project.language}</span>}
      </div>
    </Link>
  );
}

export function DiscoverPage() {
  const [search, setSearch] = useState("");
  const [languages, setLanguages] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState("");
  const [minResponsiveness, setMinResponsiveness] = useState("");
  const [sort, setSort] = useState<RepoSort>("activityScore");
  const [searchPage, setSearchPage] = useState(1);
  const [projectPage, setProjectPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search, 300);
  const debouncedLanguages = useDebouncedValue(languages, 250);

  const searchQuery = useQuery({
    queryKey: ["discover-search", debouncedSearch, searchPage],
    queryFn: () => fetchJson<SearchResponse>(
      `/api/discover/search?q=${encodeURIComponent(debouncedSearch)}&page=${searchPage}`,
    ),
    enabled: debouncedSearch.trim().length > 0,
    placeholderData: keepPreviousData,
  });

  const projectsQuery = useQuery({
    queryKey: [
      "projects",
      { languages: debouncedLanguages, difficulty, minResponsiveness, sort, projectPage },
    ],
    queryFn: () => {
      const params = new URLSearchParams({ sort, page: projectPage.toString() });
      for (const language of debouncedLanguages) params.append("language", language);
      if (difficulty) params.set("difficulty", difficulty);
      if (minResponsiveness) params.set("minResponsiveness", minResponsiveness);
      return fetchJson<ProjectDirectoryResponse>(`/api/projects?${params.toString()}`);
    },
    placeholderData: keepPreviousData,
  });

  const searchIssues = searchQuery.data?.issues ?? [];
  const searchProjects = searchQuery.data?.projects ?? [];
  const directoryProjects = projectsQuery.data?.projects ?? [];
  const searchHasPreviousPage = Boolean(
    searchQuery.data?.pagination.issues.hasPreviousPage || searchQuery.data?.pagination.projects.hasPreviousPage,
  );
  const searchHasNextPage = Boolean(
    searchQuery.data?.pagination.issues.hasNextPage || searchQuery.data?.pagination.projects.hasNextPage,
  );

  return (
    <section className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <div className="flex flex-col gap-4 border-b border-zinc-900 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-500">Discover</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-100">Find your next contribution</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
            Search issues and filter contributor-friendly repositories without digging through the page.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:w-72">
          <Card className="flex min-h-16 flex-col items-center justify-center p-3 text-center">
            <p className="text-xl font-bold text-zinc-100">{projectsQuery.data?.projects.length ?? 0}</p>
            <p className="text-[11px] font-medium text-zinc-500">Visible projects</p>
          </Card>
          <Card className="flex min-h-16 flex-col items-center justify-center p-3 text-center">
            <p className="text-xl font-bold text-zinc-100">{projectsQuery.data?.filters.languages.length ?? 0}</p>
            <p className="text-[11px] font-medium text-zinc-500">Languages</p>
          </Card>
        </div>
      </div>

      <Card className="border-zinc-800/80 bg-zinc-950/80 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative block min-w-[280px] flex-[1_1_360px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setSearchPage(1);
              }}
              placeholder="Search issues, summaries, or repos"
              className="h-9 w-full rounded-sm border border-zinc-800 bg-zinc-900 pl-9 pr-3 text-sm font-medium text-zinc-200 outline-none transition-colors placeholder:text-zinc-600 hover:border-zinc-700 focus:border-emerald-500/60"
            />
          </label>

          <div className="flex flex-[0_1_auto] flex-wrap items-center gap-3">
            <DashboardMultiSelect
              value={languages}
              onChange={(value) => {
                setLanguages(value);
                setProjectPage(1);
              }}
              options={projectsQuery.data?.filters.languages ?? []}
              placeholder="All languages"
              searchPlaceholder="Search language"
              minWidthClassName="w-52"
            />
            <DashboardFilterSelect
              value={difficulty}
              onChange={(value) => {
                setDifficulty(value);
                setProjectPage(1);
              }}
              options={[
                { value: "", label: "All difficulty" },
                { value: "beginner", label: "Beginner" },
                { value: "intermediate", label: "Intermediate" },
                { value: "advanced", label: "Advanced" },
              ]}
              minWidthClassName="w-40"
            />
            <DashboardFilterSelect
              value={minResponsiveness}
              onChange={(value) => {
                setMinResponsiveness(value);
                setProjectPage(1);
              }}
              options={[
                { value: "", label: "Any responsiveness" },
                { value: "0.4", label: "40%+" },
                { value: "0.7", label: "70%+" },
              ]}
              minWidthClassName="w-48"
            />
            <DashboardFilterSelect<RepoSort>
              value={sort}
              onChange={(value) => {
                setSort((value || "activityScore") as RepoSort);
                setProjectPage(1);
              }}
              options={[
                { value: "activityScore", label: "Activity" },
                { value: "maintainerScore", label: "Responsiveness" },
                { value: "stars", label: "Stars" },
              ]}
              minWidthClassName="w-40"
            />
          </div>
        </div>
      </Card>

      {debouncedSearch && (
        <section className="space-y-4">
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-zinc-100">Matching issues</h2>
              {searchIssues.length > 0 ? searchIssues.map((issue) => <IssueCard key={issue.id} issue={issue} />) : (
                <p className="rounded-sm border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-500">No issues found.</p>
              )}
            </div>
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-zinc-100">Matching projects</h2>
              {searchProjects.length > 0 ? searchProjects.map((project) => <ProjectMiniCard key={project.id} project={project} />) : (
                <p className="rounded-sm border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-500">No projects found.</p>
              )}
            </div>
          </div>
          {searchQuery.data && (
            <div className="flex items-center justify-between border-t border-zinc-900 pt-4">
              <p className="text-sm font-medium text-zinc-500">
                Search page {searchQuery.data.pagination.page}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!searchHasPreviousPage}
                  onClick={() => setSearchPage((current) => Math.max(1, current - 1))}
                  className="rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm font-bold text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={!searchHasNextPage}
                  onClick={() => setSearchPage((current) => current + 1)}
                  className="rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm font-bold text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {directoryProjects.map((project) => <ProjectCard key={project.id} project={project} />)}
        </div>
        {!projectsQuery.isLoading && directoryProjects.length === 0 && (
          <Card className="p-8 text-center text-sm font-medium text-zinc-500">
            No projects match these filters.
          </Card>
        )}
        {!projectsQuery.isLoading && !projectsQuery.isError && projectsQuery.data && (
          <div className="flex items-center justify-between border-t border-zinc-900 pt-4">
            <p className="text-sm font-medium text-zinc-500">
              Page {projectsQuery.data?.page ?? projectPage} of {projectsQuery.data?.totalPages ?? 1}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!projectsQuery.data?.hasPreviousPage}
                onClick={() => setProjectPage((current) => Math.max(1, current - 1))}
                className="rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm font-bold text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={!projectsQuery.data?.hasNextPage}
                onClick={() => setProjectPage((current) => current + 1)}
                className="rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm font-bold text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>

    </section>
  );
}
