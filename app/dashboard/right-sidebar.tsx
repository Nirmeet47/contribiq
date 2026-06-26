"use client";

import { useQuery } from "@tanstack/react-query";
import { Bookmark, Flame, GitFork, GitPullRequest } from "lucide-react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";

type SkillLevel = "strong" | "moderate" | "learning";

type Skill = {
  id?: string;
  name: string;
  level: SkillLevel;
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

type ContributionStatsResponse = {
  totalPRs: number;
  longestStreak: number;
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

async function fetchContributionStats() {
  const response = await fetch("/api/contributions/stats");
  if (!response.ok) throw new Error("Failed to load contribution stats");
  return (await response.json()) as ContributionStatsResponse;
}

const TRENDING_REPOS = [
  { name: "vercel/next.js", meta: "React framework", stars: "132k" },
  { name: "supabase/supabase", meta: "Backend platform", stars: "89k" },
  { name: "prisma/prisma", meta: "Database toolkit", stars: "44k" },
];

const LEVEL_STYLES: Record<SkillLevel, string> = {
  strong: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  moderate: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  learning: "border-sky-500/30 bg-sky-500/10 text-sky-300",
};

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function RightSidebar() {
  const meQuery = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const bookmarksQuery = useQuery({
    queryKey: ["bookmarks"],
    queryFn: fetchBookmarks,
  });
  const contributionStatsQuery = useQuery({
    queryKey: ["contributions-stats"],
    queryFn: fetchContributionStats,
  });

  const topSkills = (meQuery.data?.skillProfile?.skills ?? [])
    .toSorted((a, b) => b.confidence - a.confidence)
    .slice(0, 6)
    .map((skill) => ({
      skill: skill.name,
      level: skill.level,
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
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
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
          {topSkills.length > 0 && (
            <div className="space-y-2">
              {topSkills.map((skill) => (
                <div key={skill.skill} className="flex items-center justify-between gap-3 text-xs">
                  <p className="min-w-0 truncate font-bold text-zinc-200">{skill.skill}</p>
                  <span className={`shrink-0 rounded-sm border px-1.5 py-0.5 text-[10px] font-bold ${LEVEL_STYLES[skill.level]}`}>
                    {titleCase(skill.level)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="grid grid-cols-3 gap-2">
          {[
            {
              label: "Bookmarked",
              value: bookmarksQuery.data?.count ?? 0,
              icon: Bookmark,
            },
            {
              label: "PRs Merged",
              value: contributionStatsQuery.data?.totalPRs ?? 0,
              icon: GitPullRequest,
            },
            {
              label: "Streak",
              value: contributionStatsQuery.data?.longestStreak ?? 0,
              icon: Flame,
            },
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
