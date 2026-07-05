"use client";

import { LogOut } from "lucide-react";
import { DashboardRightPanel } from "./DashboardRightPanel";
import { RecommendedIssues } from "./RecommendedIssues";

export function DashboardHome({
  name,
  onLogout,
}: {
  name: string;
  onLogout: () => void;
}) {
  return (
    <section className="px-6 py-8 sm:px-8 lg:px-10">
      <div className="mb-10 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-zinc-500">Welcome back</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-zinc-50">{name}</h1>
        </div>
        <button onClick={onLogout} className="flex items-center gap-2 rounded-sm border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 md:hidden">
          <LogOut className="h-4 w-4" /> Sign Out
        </button>
      </div>

      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <RecommendedIssues />
        </div>
        <DashboardRightPanel />
      </div>
    </section>
  );
}
