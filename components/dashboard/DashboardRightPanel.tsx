"use client";

import { useQuery } from "@tanstack/react-query";
import { DashboardStats } from "./DashboardStats";
import { SkillRadar, type SkillLevel } from "./SkillRadar";
import { TrendingInStack } from "./TrendingInStack";
import { apiGet } from "@/lib/api-client";

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
  totalBookmarks?: number;
  weeklyBookmarks?: number;
};

type ContributionStatsResponse = {
  source?: "github" | "local";
  totalContributions?: number;
  totalPRs: number;
  localMergedPRs?: number;
  githubPullRequests?: number | null;
  githubCommits?: number | null;
  githubIssues?: number | null;
  githubReviews?: number | null;
  currentStreak?: number;
  longestStreak: number;
};

async function fetchMe() {
  return apiGet<MeResponse>("/api/me", "Failed to load profile");
}

async function fetchBookmarks() {
  return apiGet<BookmarksResponse>("/api/bookmarks", "Failed to load bookmarks");
}

async function fetchContributionStats() {
  return apiGet<ContributionStatsResponse>(
    "/api/contributions/stats",
    "Failed to load contribution stats"
  );
}

export function DashboardRightPanel() {
  const meQuery = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const topSkills = (meQuery.data?.skillProfile?.skills ?? [])
    .toSorted((a, b) => b.confidence - a.confidence)
    .slice(0, 6)
    .map((skill) => ({
      skill: skill.name,
      level: skill.level,
      confidence: Math.round(skill.confidence * 100),
    }));
  const skillQueryKey = topSkills.map((skill) => `${skill.skill}:${skill.level}`);

  const bookmarksQuery = useQuery({
    queryKey: ["bookmarks"],
    queryFn: fetchBookmarks,
  });
  const contributionStatsQuery = useQuery({
    queryKey: ["contributions-stats"],
    queryFn: fetchContributionStats,
  });

  return (
    <aside className="hidden bg-zinc-950 p-6 lg:block">
      <div className="space-y-6">
        <SkillRadar skills={topSkills} />
        <DashboardStats
          totalBookmarks={bookmarksQuery.data?.totalBookmarks ?? bookmarksQuery.data?.count ?? 0}
          weeklyBookmarks={bookmarksQuery.data?.weeklyBookmarks ?? 0}
          totalContributions={contributionStatsQuery.data?.totalContributions ?? contributionStatsQuery.data?.totalPRs ?? 0}
          totalPRs={contributionStatsQuery.data?.totalPRs ?? 0}
          currentStreak={contributionStatsQuery.data?.currentStreak ?? 0}
        />
        <TrendingInStack enabled={meQuery.isSuccess} skillQueryKey={skillQueryKey} />
      </div>
    </aside>
  );
}
