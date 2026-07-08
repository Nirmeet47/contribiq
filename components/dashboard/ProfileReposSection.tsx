"use client";

import { GitPullRequest, Star } from "lucide-react";
import { useMemo, useState } from "react";

type ProfileRepo = {
  id: string | null;
  owner: string;
  name: string;
  fullName: string;
  stars: number;
  url?: string;
};

function repoFromFullName(fullName: string): ProfileRepo {
  const [owner = "unknown", name = fullName] = fullName.split("/");
  return {
    id: null,
    owner,
    name,
    fullName,
    stars: 0,
    url: `https://github.com/${fullName}`,
  };
}

export function ProfileReposSection({
  repos,
  monthlyRepoFullNames,
}: {
  repos: ProfileRepo[];
  monthlyRepoFullNames: string[];
}) {
  const [mode, setMode] = useState<"overall" | "month">("overall");
  const monthlyRepoSet = useMemo(() => {
    return new Set(monthlyRepoFullNames.map((name) => name.toLowerCase()));
  }, [monthlyRepoFullNames]);
  const completeRepos = useMemo(() => {
    const repoByName = new Map(repos.map((repo) => [repo.fullName.toLowerCase(), repo]));
    for (const fullName of monthlyRepoFullNames) {
      if (!repoByName.has(fullName.toLowerCase())) {
        repoByName.set(fullName.toLowerCase(), repoFromFullName(fullName));
      }
    }
    return Array.from(repoByName.values());
  }, [monthlyRepoFullNames, repos]);
  const visibleRepos =
    mode === "month"
      ? completeRepos.filter((repo) => monthlyRepoSet.has(repo.fullName.toLowerCase()))
      : completeRepos;

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-4 border-b border-zinc-900 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Repositories</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Switch between all contributed repositories and repositories active this month.
          </p>
        </div>

        <div className="grid w-full grid-cols-2 rounded-sm border border-zinc-800 bg-zinc-950 p-1 sm:w-auto">
          {[
            { label: "Overall", value: "overall" as const, count: completeRepos.length },
            { label: "This month", value: "month" as const, count: monthlyRepoSet.size },
          ].map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setMode(item.value)}
              className={`h-9 px-3 text-xs font-bold transition-colors ${
                mode === item.value
                  ? "bg-emerald-500 text-zinc-950"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
              }`}
            >
              {item.label} ({item.count})
            </button>
          ))}
        </div>
      </div>

      {visibleRepos.length === 0 ? (
        <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-6 text-sm font-medium text-zinc-500">
          No repositories found in this view.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {visibleRepos.map((repo) => {
            const activeThisMonth = monthlyRepoSet.has(repo.fullName.toLowerCase());

            return (
              <a
                key={repo.fullName}
                href={repo.url ?? `https://github.com/${repo.fullName}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-sm border border-zinc-800 bg-zinc-950 p-4 transition-colors hover:border-zinc-700"
              >
                <div className="flex items-start justify-between gap-3">
                  <div
                    className="h-10 w-10 rounded-sm bg-zinc-900 bg-cover bg-center"
                    style={{ backgroundImage: `url(https://github.com/${repo.owner}.png)` }}
                  />
                  {activeThisMonth && (
                    <span className="inline-flex items-center gap-1 rounded-sm border border-emerald-800 bg-emerald-900/40 px-2 py-1 text-[11px] font-bold text-emerald-400">
                      <GitPullRequest className="h-3 w-3" />
                      This month
                    </span>
                  )}
                </div>
                <p className="mt-4 truncate text-sm font-bold text-zinc-100">{repo.name}</p>
                <p className="mt-1 truncate text-xs text-zinc-500">{repo.owner}</p>
                <p className="mt-3 flex items-center gap-1 text-xs text-zinc-500">
                  <Star className="h-3 w-3 text-amber-300" />
                  {repo.stars.toLocaleString()}
                </p>
              </a>
            );
          })}
        </div>
      )}
    </section>
  );
}
