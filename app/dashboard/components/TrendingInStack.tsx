"use client";

import { useQuery } from "@tanstack/react-query";
import { GitFork } from "lucide-react";

type TrendingRepo = {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  language: string | null;
  stars: number;
  categories: string[];
  activityScore: number;
};

type TrendingReposResponse = {
  repos: TrendingRepo[];
};

async function fetchTrendingRepos() {
  const response = await fetch("/api/repos/trending", { cache: "no-store" });
  if (!response.ok) throw new Error("Failed to load trending repos");
  return (await response.json()) as TrendingReposResponse;
}

function formatStars(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return value.toString();
}

export function TrendingInStack({
  enabled,
  skillQueryKey,
}: {
  enabled: boolean;
  skillQueryKey: string[];
}) {
  const trendingReposQuery = useQuery({
    queryKey: ["trending-repos", skillQueryKey],
    queryFn: fetchTrendingRepos,
    enabled,
  });

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold text-zinc-100">Trending in your stack</h2>
      <div
        className="custom-scrollbar scroll-fade h-[336px] space-y-2 overflow-y-scroll rounded-sm border border-zinc-900 bg-zinc-950/60 p-2 pr-1"
        aria-label="Trending repositories in your stack"
      >
        {trendingReposQuery.isLoading ? (
          [1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-[74px] animate-pulse rounded-sm border border-zinc-800 bg-zinc-900/40"
            />
          ))
        ) : trendingReposQuery.data?.repos.length === 0 ? (
          <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-3">
            <p className="text-xs font-medium leading-5 text-zinc-500">
              No stack-matched repositories yet.
            </p>
          </div>
        ) : trendingReposQuery.isError ? (
          <div className="rounded-sm border border-red-500/30 bg-red-500/10 p-3">
            <p className="text-xs font-medium leading-5 text-red-300">
              Trending repositories could not be loaded.
            </p>
          </div>
        ) : (
          trendingReposQuery.data?.repos.map((repo) => (
            <a
              key={repo.id}
              href={`https://github.com/${repo.fullName}`}
              target="_blank"
              rel="noreferrer"
              className="block h-[74px] rounded-sm border border-zinc-800 bg-zinc-950 p-3 transition-colors hover:border-zinc-700 hover:bg-zinc-900/60"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-bold text-zinc-200">{repo.fullName}</h3>
                  <p className="truncate text-xs font-medium text-zinc-500">
                    {repo.description || repo.language || repo.categories[0] || "Repository"}
                  </p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-zinc-800 bg-zinc-900 px-2 py-1 text-[11px] font-medium text-zinc-400">
                  <GitFork className="h-3 w-3" />
                  {formatStars(repo.stars)}
                </span>
              </div>
            </a>
          ))
        )}
      </div>
    </section>
  );
}
