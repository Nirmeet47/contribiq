"use client";

import type { ReactNode } from "react";
import { DashboardMobileNav, DashboardSidebar } from "@/components/dashboard/DashboardSidebar";

export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen md:flex">
      <DashboardSidebar />
      <div className="min-w-0 flex-1">
        <DashboardMobileNav />
        {children}
      </div>
    </div>
  );
}
