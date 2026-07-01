"use client";

import { AppShell } from "@/app/app-shell";
import { LogOut } from "lucide-react";
import { DashboardSidebar } from "./DashboardSidebar";
import { RecommendedIssues } from "./RecommendedIssues";

export function DashboardHome({
  name,
  onLogout,
}: {
  name: string;
  onLogout: () => void;
}) {
  return (
    <AppShell>
      <section className="p-6 sm:p-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-zinc-500">Welcome back</p>
            <h1 className="text-2xl font-bold tracking-tight">{name}</h1>
          </div>
          <button onClick={onLogout} className="flex items-center gap-2 rounded-sm border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 md:hidden">
            <LogOut className="h-4 w-4" /> Sign Out
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <RecommendedIssues />
          </div>
          <DashboardSidebar />
        </div>
      </section>

      <style jsx global>{`
        .custom-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: #3f3f46 transparent;
          scrollbar-gutter: stable;
        }
        .custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
          border-radius: 2px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #27272a;
          border: 2px solid transparent;
          border-radius: 999px;
          background-clip: padding-box;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: #52525b; }
        .scroll-fade {
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.03),
            inset 0 -18px 24px -24px rgba(0, 0, 0, 0.95);
        }
      `}</style>
    </AppShell>
  );
}
