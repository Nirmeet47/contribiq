"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";

function isDetailRoute(pathname: string) {
  return /^\/(?:projects|issues)\/[^/]+\/?$/.test(pathname);
}

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hideSidebar = isDetailRoute(pathname);

  return (
    <div className="flex min-h-screen">
      {!hideSidebar && <DashboardSidebar />}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
