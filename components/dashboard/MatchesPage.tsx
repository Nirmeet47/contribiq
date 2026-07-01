"use client";

import { Badge } from "@/components/ui/badge";
import { DashboardPageLayout } from "./DashboardPageLayout";
import { RecommendedIssues } from "./RecommendedIssues";

export function MatchesPage() {
  return (
    <DashboardPageLayout>
      <section className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        <div className="flex flex-col gap-4 border-b border-zinc-900 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-500">
              Issue matches
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-100">
              Recommended work
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
              Personalized issue matches ranked from your skills, interests, and contribution profile.
            </p>
          </div>
          <Badge variant="success">Live recommendations</Badge>
        </div>

        <RecommendedIssues />
      </section>
    </DashboardPageLayout>
  );
}
