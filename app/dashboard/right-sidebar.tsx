"use client";

import { useQuery } from "@tanstack/react-query";
import { Bookmark, Flame, GitFork, GitPullRequest } from "lucide-react";
import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";

type Skill = {
  id?: string;
  name: string;
  confidence: number;
};

type MeResponse = {
  skillProfile?: {
    skills?: Skill[];
  } | null;
};

type BookmarksResponse = {
  count: number;
};

async function fetchMe() {
  const response = await fetch("/api/me");
  if (!response.ok) throw new Error("Failed to load profile");
  return (await response.json()) as MeResponse;
}

async function fetchBookmarks() {
  const response = await fetch("/api/bookmarks");
  if (!response.ok) throw new Error("Failed to load bookmarks");
  return (await response.json()) as BookmarksResponse;
}

const TRENDING_REPOS = [
  { name: "vercel/next.js", meta: "React framework", stars: "132k" },
  { name: "supabase/supabase", meta: "Backend platform", stars: "89k" },
  { name: "prisma/prisma", meta: "Database toolkit", stars: "44k" },
];

export function RightSidebar() {
  const meQuery = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const bookmarksQuery = useQuery({
    queryKey: ["bookmarks"],
    queryFn: fetchBookmarks,
  });

  const topSkills = (meQuery.data?.skillProfile?.skills ?? [])
    .toSorted((a, b) => b.confidence - a.confidence)
    .slice(0, 6)
    .map((skill) => ({
      skill: skill.name,
      confidence: Math.round(skill.confidence * 100),
    }));

  const chartData =
    topSkills.length > 0
      ? topSkills
      : [
          { skill: "Frontend", confidence: 0 },
          { skill: "Backend", confidence: 0 },
          { skill: "Testing", confidence: 0 },
        ];

  return (
    <aside className="hidden bg-zinc-950 p-6 lg:block">
      <div className="space-y-6">
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-bold text-zinc-100">Skill radar</h2>
            <p className="text-xs font-medium text-zinc-500">Top confidence signals</p>
          </div>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height={250}>
              <RadarChart data={chartData} outerRadius="70%">
                <PolarGrid stroke="#3f3f46" />
                <PolarAngleAxis
                  dataKey="skill"
                  tick={{ fill: "#a1a1aa", fontSize: 11, fontWeight: 600 }}
                />
                <Radar
                  dataKey="confidence"
                  stroke="#34d399"
                  fill="#34d399"
                  fillOpacity={0.28}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="grid grid-cols-3 gap-2">
          {[
            {
              label: "Bookmarked",
              value: bookmarksQuery.data?.count ?? 0,
              icon: Bookmark,
            },
            { label: "PRs Merged", value: 0, icon: GitPullRequest },
            { label: "Streak", value: 0, icon: Flame },
          ].map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="rounded-sm border border-zinc-800 bg-zinc-900/40 p-3">
                <Icon className="mb-3 h-4 w-4 text-zinc-500" />
                <p className="text-lg font-bold text-zinc-100">{stat.value}</p>
                <p className="text-[11px] font-medium leading-4 text-zinc-500">{stat.label}</p>
              </div>
            );
          })}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-bold text-zinc-100">Trending in your stack</h2>
          <div className="space-y-2">
            {TRENDING_REPOS.map((repo) => (
              <article
                key={repo.name}
                className="rounded-sm border border-zinc-800 bg-zinc-950 p-3 transition-colors hover:border-zinc-700"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-bold text-zinc-200">{repo.name}</h3>
                    <p className="text-xs font-medium text-zinc-500">{repo.meta}</p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-zinc-800 bg-zinc-900 px-2 py-1 text-[11px] font-medium text-zinc-400">
                    <GitFork className="h-3 w-3" />
                    {repo.stars}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
}
