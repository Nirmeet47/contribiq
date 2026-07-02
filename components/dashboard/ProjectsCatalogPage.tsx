"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Activity, ExternalLink, GitFork, Search, Star } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

type ProjectSort = "activity" | "stars" | "issues" | "health" | "name";

type ProjectRepo = {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  categories: string[];
  stars: number;
  language: string | null;
  maintainerScore: number;
  activityScore: number;
  healthScore: number;
  openIssueCount: number;
  classifiedIssueCount: number;
  lastFetchedAt: string | null;
};

type ProjectsResponse = {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  totalOpenIssues: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  repos: ProjectRepo[];
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
  language,
  sort,
  page,
}: {
  search: string;
  category: string;
  language: string;
  sort: ProjectSort;
  page: number;
}) {
  const params = new URLSearchParams({ sort, page: page.toString() });
  if (search.trim()) params.set("q", search.trim());
  if (category) params.set("category", category);
  if (language) params.set("language", language);

  const response = await fetch(`/api/projects?${params.toString()}`);
  if (!response.ok) throw new Error("Failed to load projects");
  return (await response.json()) as ProjectsResponse;
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

function ProjectCard({ repo }: { repo: ProjectRepo }) {
  return (
    <Card className="flex min-h-[296px] flex-col transition-colors hover:border-zinc-700">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-xs font-bold text-zinc-500">{repo.owner}</p>
            <CardTitle className="mt-1 truncate">{repo.fullName}</CardTitle>
          </div>
          <Badge variant={repo.openIssueCount > 0 ? "success" : "secondary"}>
            {repo.openIssueCount} open
          </Badge>
        </div>
        <CardDescription className="line-clamp-2">
          {repo.description || "Curated repository in the ContribIQ catalog."}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1 space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-sm border border-zinc-900 bg-zinc-950 p-3">
            <div className="flex items-center gap-1 text-xs font-bold text-zinc-300">
              <Star className="h-3.5 w-3.5 text-amber-300" />
              {formatStars(repo.stars)}
            </div>
            <p className="mt-1 text-[11px] font-medium text-zinc-600">Stars</p>
          </div>
          <div className="rounded-sm border border-zinc-900 bg-zinc-950 p-3">
            <div className="flex items-center gap-1 text-xs font-bold text-zinc-300">
              <GitFork className="h-3.5 w-3.5 text-emerald-300" />
              {repo.classifiedIssueCount}
            </div>
            <p className="mt-1 text-[11px] font-medium text-zinc-600">Ready</p>
          </div>
          <div className="rounded-sm border border-zinc-900 bg-zinc-950 p-3">
            <div className="flex items-center gap-1 text-xs font-bold text-zinc-300">
              <Activity className="h-3.5 w-3.5 text-sky-300" />
              {percent(repo.healthScore)}
            </div>
            <p className="mt-1 text-[11px] font-medium text-zinc-600">Health</p>
          </div>
        </div>

        <div className="space-y-3">
          <MetricBar label="Maintainers" value={repo.maintainerScore} />
          <MetricBar label="Activity" value={repo.activityScore} />
        </div>

        <div className="flex flex-wrap gap-2">
          {repo.language && <Badge variant="outline">{repo.language}</Badge>}
          {repo.categories.slice(0, 3).map((category) => (
            <Badge key={category} variant="secondary">
              {titleCase(category)}
            </Badge>
          ))}
        </div>
      </CardContent>

      <CardFooter className="justify-between border-t border-zinc-900 pt-4">
        <Link
          href={`/projects/${repo.id}`}
          className="inline-flex h-9 items-center justify-center rounded-sm bg-emerald-500 px-3 text-xs font-bold text-zinc-950 transition-colors hover:bg-emerald-400"
        >
          View project
        </Link>
        <a
          href={`https://github.com/${repo.fullName}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 w-9 items-center justify-center rounded-sm border border-zinc-800 bg-zinc-950 text-zinc-400 transition-colors hover:border-zinc-700 hover:text-white"
          aria-label={`Open ${repo.fullName} on GitHub`}
          title="Open on GitHub"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </CardFooter>
    </Card>
  );
}

export function ProjectsCatalogPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [language, setLanguage] = useState("");
  const [sort, setSort] = useState<ProjectSort>("activity");
  const [page, setPage] = useState(1);

  const projectsQuery = useQuery({
    queryKey: ["projects", { search, category, language, sort, page }],
    queryFn: () => fetchProjects({ search, category, language, sort, page }),
  });

  const repos = projectsQuery.data?.repos ?? [];
  const languages = projectsQuery.data?.filters.languages ?? [];
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
              <p className="text-[11px] font-medium text-zinc-500">Visible repos</p>
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
          <div className="grid gap-3 xl:grid-cols-[1fr_auto_auto_auto] xl:items-center">
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

            <select
              value={language}
              onChange={(event) => {
                setLanguage(event.target.value);
                setPage(1);
              }}
              className="h-10 rounded-sm border border-zinc-800 bg-zinc-900 px-3 text-sm font-bold text-zinc-300 outline-none transition-colors hover:border-zinc-700"
              aria-label="Filter by language"
            >
              <option value="">All languages</option>
              {languages.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>

            <select
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as ProjectSort);
                setPage(1);
              }}
              className="h-10 rounded-sm border border-zinc-800 bg-zinc-900 px-3 text-sm font-bold text-zinc-300 outline-none transition-colors hover:border-zinc-700"
              aria-label="Sort projects"
            >
              {(Object.entries(SORT_LABELS) as Array<[ProjectSort, string]>).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>

            {(search || category || language || sort !== "activity") && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSearch("");
                  setCategory("");
                  setLanguage("");
                  setSort("activity");
                  setPage(1);
                }}
              >
                Reset
              </Button>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setCategory("");
                setPage(1);
              }}
              className={`rounded-sm border px-3 py-1.5 text-xs font-bold transition-colors ${
                !category
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white"
              }`}
            >
              All stacks
            </button>
            {categoryOptions.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setCategory(item);
                  setPage(1);
                }}
                className={`rounded-sm border px-3 py-1.5 text-xs font-bold transition-colors ${
                  category === item
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                    : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white"
                }`}
              >
                {titleCase(item)}
              </button>
            ))}
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
        ) : repos.length === 0 ? (
          <Card className="p-10 text-center">
            <h2 className="text-lg font-bold text-zinc-100">No repositories found</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-500">
              Try a different search or filter combination.
            </p>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {repos.map((repo) => (
              <ProjectCard key={repo.id} repo={repo} />
            ))}
          </div>
        )}

        {!projectsQuery.isLoading && !projectsQuery.isError && repos.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-zinc-900 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-zinc-500">
              Page {projectsQuery.data?.page ?? page} of {projectsQuery.data?.totalPages ?? 1}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={!projectsQuery.data?.hasPreviousPage}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!projectsQuery.data?.hasNextPage}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
    </section>
  );
}
