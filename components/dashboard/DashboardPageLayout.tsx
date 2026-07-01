import type { ReactNode } from "react";
import { DashboardSidebar } from "./DashboardSidebar";

export function DashboardPageLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50 font-sans selection:bg-emerald-500/30">
      <div className="flex min-h-screen">
        <DashboardSidebar />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </main>
  );
}
