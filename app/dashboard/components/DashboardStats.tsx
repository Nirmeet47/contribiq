"use client";

import { Bookmark, Flame, GitPullRequest } from "lucide-react";

export function DashboardStats({
  weeklyBookmarks,
  totalPRs,
  currentStreak,
}: {
  weeklyBookmarks: number;
  totalPRs: number;
  currentStreak: number;
}) {
  return (
    <section className="grid grid-cols-3 gap-2">
      {[
        {
          label: "Bookmarked",
          value: weeklyBookmarks,
          icon: Bookmark,
        },
        {
          label: "PRs Merged",
          value: totalPRs,
          icon: GitPullRequest,
        },
        {
          label: "Streak",
          value: currentStreak,
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
  );
}
