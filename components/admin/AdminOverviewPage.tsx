"use client";

import { useQuery } from "@tanstack/react-query";
import { Database, GitPullRequest, Layers3, UsersRound } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ErrorState, LoadingState, PageHeader, formatNumber } from "@/components/admin/admin-utils";

type OverviewResponse = {
  database: {
    repos: number;
    indexedRepos: number;
    openIssues: number;
    classifiedOpenIssues: number;
    repoDocChunks: number;
    users: number;
    onboardedUsers: number;
  };
  indexingStatus: Array<{ status: string; count: number }>;
};

async function fetchOverview() {
  const response = await fetch("/api/admin/overview");
  if (!response.ok) throw new Error("Failed to load admin overview");
  return (await response.json()) as OverviewResponse;
}

const STAT_ITEMS = [
  { label: "Repos indexed", key: "indexedRepos", totalKey: "repos", icon: Database },
  { label: "Open issues", key: "openIssues", icon: GitPullRequest },
  { label: "Classified issues", key: "classifiedOpenIssues", icon: Layers3 },
  { label: "Total users", key: "users", icon: UsersRound },
  { label: "Users onboarded", key: "onboardedUsers", icon: UsersRound },
] as const;

export function AdminOverviewPage() {
  const overviewQuery = useQuery({ queryKey: ["admin", "overview"], queryFn: fetchOverview });
  const overview = overviewQuery.data;

  if (overviewQuery.isLoading) return <LoadingState label="Loading admin overview..." />;
  if (overviewQuery.isError || !overview) return <ErrorState label="Admin overview could not be loaded." />;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-6 sm:px-8 lg:px-10">
      <PageHeader title="Admin Overview" subtitle="Global health, usage, and indexing status." />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {STAT_ITEMS.map((item) => {
          const Icon = item.icon;
          const value = overview.database[item.key];
          const total = "totalKey" in item ? overview.database[item.totalKey] : null;

          return (
            <div key={item.label} className="rounded-sm border border-zinc-800 bg-zinc-900/50 p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-zinc-300">{item.label}</p>
                <Icon className="h-4 w-4 text-zinc-300" />
              </div>
              <p className="text-lg font-semibold leading-none text-white">
                {formatNumber(value)}
                {total !== null ? <span className="text-zinc-400"> / {formatNumber(total)}</span> : null}
              </p>
            </div>
          );
        })}
      </section>

      <section className="rounded-sm border border-zinc-800 bg-zinc-950 p-5">
        <h2 className="mb-4 text-lg font-semibold text-white">Indexing breakdown</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={overview.indexingStatus}>
              <CartesianGrid stroke="#27272a" vertical={false} />
              <XAxis dataKey="status" stroke="#a1a1aa" tickLine={false} axisLine={false} />
              <YAxis stroke="#a1a1aa" tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: "#18181b" }}
                contentStyle={{ background: "#09090b", border: "1px solid #27272a", borderRadius: 2 }}
              />
              <Bar dataKey="count" fill="#34d399" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
