"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { DashboardProfileInsights } from "./DashboardProfileInsights";
import { RecommendedIssues } from "./RecommendedIssues";
import { apiGet } from "@/lib/api-client";

type DashboardUser = {
  username?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
  createdAt?: string | Date | null;
  interests?: string[] | null;
  timeCommitment?: number | null;
  skillProfile?: {
    skills?: unknown[];
  } | null;
};

async function fetchMe() {
  return apiGet<DashboardUser>("/api/me", "Failed to load profile");
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "recently";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function DashboardProfileHeader() {
  const meQuery = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const user = meQuery.data;
  const displayName = user?.name || user?.username || "Developer";
  const username = user?.username || "developer";
  const skillCount = user?.skillProfile?.skills?.length ?? 0;
  const interestCount = user?.interests?.length ?? 0;
  const weeklyHours = user?.timeCommitment ? `${user.timeCommitment}h/week` : "Not set";
  const stats = [
    { label: "Skills", value: skillCount.toLocaleString() },
    { label: "Interests", value: interestCount.toLocaleString() },
    { label: "Availability", value: weeklyHours },
  ];

  return (
    <section className="overflow-hidden rounded-sm border border-zinc-800 bg-zinc-950 p-6 shadow-sm">
      <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
          <div
            className="h-16 w-16 shrink-0 rounded-lg border border-emerald-300/20 bg-zinc-950 bg-cover bg-center"
            style={{ backgroundImage: user?.avatarUrl ? `url(${user.avatarUrl})` : undefined }}
          />
          <div className="min-w-0">
            <span className="inline-flex rounded-sm bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-400">
              @{username}
            </span>
            <h1 className="mt-2 truncate text-2xl font-bold tracking-tight text-white sm:text-3xl">{displayName}</h1>
            <div className="mt-1 text-sm font-medium text-zinc-400">
              Joined <span className="text-zinc-200">{formatDate(user?.createdAt)}</span>
            </div>
          </div>
        </div>

        <Link
          href={`/${username}`}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-sm bg-emerald-500 px-4 text-sm font-bold text-zinc-950 transition-colors hover:bg-emerald-400"
        >
          Public view
          <ExternalLink className="h-4 w-4" />
        </Link>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-sm border border-zinc-800 bg-zinc-900/50 px-4 py-3">
            <p className="text-sm font-medium text-white">{stat.label}</p>
            <p className="mt-1 text-xl font-semibold leading-none text-white">{stat.value}</p>
          </div>
        ))}
      </div>

      {meQuery.isLoading && (
        <div className="mt-5 h-1 overflow-hidden rounded-sm bg-zinc-900">
          <div className="h-full w-1/3 animate-pulse rounded-sm bg-emerald-500/50" />
        </div>
      )}
    </section>
  );
}

export function DashboardHome() {
  return (
    <section className="mx-auto w-full max-w-7xl px-6 py-8 sm:px-8 lg:px-12">
      <div className="space-y-10">
        <DashboardProfileHeader />
        <RecommendedIssues />
        <DashboardProfileInsights />
      </div>
    </section>
  );
}
