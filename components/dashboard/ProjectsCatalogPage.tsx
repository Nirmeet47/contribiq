"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardFilterSelect, DashboardMultiSelect } from "@/components/dashboard/DashboardFilterSelect";
import { PaginationControls } from "@/components/ui/pagination-controls";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Activity, GitFork, Search, Star } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { apiGet } from "@/lib/api-client";
import type { ProjectSummary } from "@/lib/project-serializer";

type ProjectSort = "activity" | "stars" | "issues" | "health" | "name";

type ProjectsResponse = {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  totalOpenIssues: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  projects: ProjectSummary[];
  filters: {
    languages: string[];
    categories: string[];
  };
};

const SORT_LABELS: Record<ProjectSort, string> = {
  activity: "Activity",
  stars: "Stars",
  issues: "Open issues",
  health: "Repo health",
  name: "Name",
};

function formatStars(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return value.toString();
}

function percent(value: number) {
  return Math.round(Math.max(0, Math.min(1, value)) * 100);
}

function titleCase(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function fetchProjects({
  search,
  category,
  languages,
  sort,
  page,
}: {
  search: string;
  category: string;
  languages: string[];
  sort: ProjectSort;
  page: number;
}) {
  const params = new URLSearchParams({ sort, page: page.toString() });
  if (search.trim()) params.set("q", search.trim());
  if (category) params.set("category", category);
  for (const language of languages) params.append("language", language);

  return apiGet<ProjectsResponse>(`/api/projects?${params.toString()}`, "Failed to load projects");
}

function MetricBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-zinc-500">
        <span>{label}</span>
        <span className="text-zinc-300">{percent(value)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-sm bg-zinc-900">
        <div className="h-full rounded-sm bg-emerald-400" style={{ width: `${percent(value)}%` }} />
      </div>
    </div>
  );
}

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M12 2C6.48 2 2 6.58 2 12.24c0 4.52 2.87 8.35 6.84 9.71.5.1.68-.22.68-.49 0-.24-.01-1.04-.01-1.89-2.78.62-3.37-1.22-3.37-1.22-.45-1.19-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.35 1.12 2.92.85.09-.66.35-1.12.63-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.35 9.35 0 0 1 12 6.95c.85 0 1.7.12 2.5.34 1.9-1.33 2.74-1.05 2.74-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.8 0 .27.18.59.69.49A10.07 10.07 0 0 0 22 12.24C22 6.58 17.52 2 12 2Z" />
    </svg>
  );
}

export function ProjectCard({ project }: { project: ProjectSummary }) {
  const logoUrl = `https://github.com/${project.owner}.png`;

  return (
    <Card className="flex min-h-[278px] flex-col transition-colors hover:border-zinc-700">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className="h-11 w-11 shrink-0 rounded-sm border border-zinc-800 bg-zinc-900 bg-cover bg-center"
              style={{ backgroundImage: `url(${logoUrl})` }}
              aria-label={`${project.owner} logo`}
            />
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-zinc-500">{project.owner}</p>
              <CardTitle className="mt-0.5 truncate text-lg leading-6">{project.fullName}</CardTitle>
            </div>
          </div>
          <Badge variant={project.openIssueCount > 0 ? "success" : "secondary"}>
            {project.openIssueCount} open
          </Badge>
        </div>
        <CardDescription className="line-clamp-2">
          {project.description || "Curated project in the ContribIQ catalog."}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1 space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-sm border border-zinc-900 bg-zinc-950 p-3">
            <div className="flex items-center gap-1 text-xs font-bold text-zinc-300">
              <Star className="h-3.5 w-3.5 text-amber-300" />
              {formatStars(project.stars)}
            </div>
            <p className="mt-1 text-[11px] font-medium text-zinc-600">Stars</p>
          </div>
          <div className="rounded-sm border border-zinc-900 bg-zinc-950 p-3">
            <div className="flex items-center gap-1 text-xs font-bold text-zinc-300">
              <GitFork className="h-3.5 w-3.5 text-emerald-300" />
              {project.classifiedIssueCount}
            </div>
            <p className="mt-1 text-[11px] font-medium text-zinc-600">Ready</p>
          </div>
          <div className="rounded-sm border border-zinc-900 bg-zinc-950 p-3">
            <div className="flex items-center gap-1 text-xs font-bold text-zinc-300">
              <Activity className="h-3.5 w-3.5 text-sky-300" />
              {percent(project.healthScore)}
            </div>
            <p className="mt-1 text-[11px] font-medium text-zinc-600">Health</p>
          </div>
        </div>

        <div className="space-y-3">
          <MetricBar label="Maintainers" value={project.maintainerScore} />
          <MetricBar label="Activity" value={project.activityScore} />
        </div>

        <div className="flex flex-wrap gap-2">
          {project.language && <Badge variant="outline">{project.language}</Badge>}
          {project.categories.slice(0, 3).map((category) => (
            <Badge key={category} variant="secondary">
              {titleCase(category)}
            </Badge>
          ))}
        </div>
      </CardContent>

      <CardFooter className="justify-between border-t border-zinc-900 pt-4">
        <Link
          href={`/projects/${project.id}`}
          className="inline-flex h-9 items-center justify-center rounded-sm bg-emerald-500 px-4 text-xs font-bold text-zinc-950 transition-colors hover:bg-emerald-400"
        >
          View project
        </Link>
        <a
          href={`https://github.com/${project.fullName}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 w-9 items-center justify-center rounded-sm border border-zinc-800 bg-zinc-950 text-zinc-400 transition-colors hover:border-zinc-700 hover:text-white"
          aria-label={`Open ${project.fullName} on GitHub`}
          title="Open on GitHub"
        >
          <GitHubMark className="h-4 w-4" />
        </a>
      </CardFooter>
    </Card>
  );
}

export function ProjectsCatalogPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [sort, setSort] = useState<ProjectSort>("activity");
  const [page, setPage] = useState(1);

  const projectsQuery = useQuery({
    queryKey: ["projects", { search, category, selectedLanguages, sort, page }],
    queryFn: () => fetchProjects({ search, category, languages: selectedLanguages, sort, page }),
    placeholderData: keepPreviousData,
  });

  const projects = projectsQuery.data?.projects ?? [];
  const languageOptions = projectsQuery.data?.filters.languages ?? [];
  const categoryOptions = projectsQuery.data?.filters.categories.slice(0, 12) ?? [];

  return (
    <section className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        <div className="flex flex-col gap-4 border-b border-zinc-900 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-500">
              Repo discovery
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-100">
              Projects
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
              Browse curated repositories with open issue counts, stack filters, and contribution health.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:w-64">
            <Card className="p-3">
              <p className="text-xl font-bold text-zinc-100">{projectsQuery.data?.total ?? 0}</p>
              <p className="text-[11px] font-medium text-zinc-500">Visible projects</p>
            </Card>
            <Card className="p-3">
              <p className="text-xl font-bold text-zinc-100">
                {projectsQuery.data?.totalOpenIssues ?? 0}
              </p>
              <p className="text-[11px] font-medium text-zinc-500">Open issues</p>
            </Card>
          </div>
        </div>

        <Card className="p-4">
          <div className="grid gap-3 xl:grid-cols-[1fr_auto_auto_auto_auto] xl:items-end">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search owner, repo, or description"
                className="h-10 w-full rounded-sm border border-zinc-800 bg-zinc-900 pl-9 pr-3 text-sm font-medium text-zinc-200 outline-none transition-colors placeholder:text-zinc-600 hover:border-zinc-700 focus:border-emerald-500/60"
              />
            </label>

            <DashboardFilterSelect
              value={category}
              onChange={(value) => {
                setCategory(value);
                setPage(1);
              }}
              options={[
                { value: "", label: "All stacks" },
                ...categoryOptions.map((item) => ({ value: item, label: titleCase(item) })),
              ]}
              minWidthClassName="min-w-44"
            />

            <DashboardMultiSelect
              value={selectedLanguages}
              onChange={(value) => {
                setSelectedLanguages(value);
                setPage(1);
              }}
              options={languageOptions}
              placeholder="All languages"
              searchPlaceholder="Search language"
              minWidthClassName="min-w-44"
            />

            <DashboardFilterSelect<ProjectSort>
              value={sort}
              onChange={(value) => {
                setSort((value || "activity") as ProjectSort);
                setPage(1);
              }}
              options={(Object.entries(SORT_LABELS) as Array<[ProjectSort, string]>).map(([value, label]) => ({
                value,
                label,
              }))}
              minWidthClassName="min-w-40"
            />

            {(search || category || selectedLanguages.length > 0 || sort !== "activity") && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSearch("");
                  setCategory("");
                  setSelectedLanguages([]);
                  setSort("activity");
                  setPage(1);
                }}
              >
                Reset
              </Button>
            )}
          </div>
        </Card>

        {projectsQuery.isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((item) => (
              <Card key={item} className="h-[296px] animate-pulse bg-zinc-900/60" />
            ))}
          </div>
        ) : projectsQuery.isError ? (
          <Card className="p-8 text-center text-sm font-medium text-red-300">
            Projects could not be loaded.
          </Card>
        ) : projects.length === 0 ? (
          <Card className="p-10 text-center">
            <h2 className="text-lg font-bold text-zinc-100">No projects found</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-500">
              Try a different search or filter combination.
            </p>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}

        {!projectsQuery.isLoading && !projectsQuery.isError && projects.length > 0 && (
          <PaginationControls
            page={projectsQuery.data?.page ?? page}
            totalPages={projectsQuery.data?.totalPages ?? 1}
            hasPreviousPage={Boolean(projectsQuery.data?.hasPreviousPage)}
            hasNextPage={Boolean(projectsQuery.data?.hasNextPage)}
            onPageChange={setPage}
          />
        )}
    </section>
  );
}
