"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Bookmark,
  CheckCircle2,
  Code2,
  Compass,
  Inbox,
  LayoutDashboard,
  LogOut,
  Settings,
  Trophy,
  UserRound,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";

const NAV_ITEMS = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { label: "Working", icon: CheckCircle2, href: "/working" },
  { label: "Bookmarks", icon: Bookmark, href: "/bookmarks" },
  { label: "Discover", icon: Compass, href: "/discover" },
  { label: "Skills", icon: BookOpen, href: "/skills" },
  { label: "Contributions", icon: Trophy, href: "/contributions" },
  { label: "Profile", icon: UserRound, href: "/profile" },
  { label: "Settings", icon: Settings, href: "/settings" },
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardSidebar() {
  const pathname = usePathname();

  async function handleLogout() {
    await createClient().auth.signOut();
    window.location.href = "/login";
  }

  return (
    <aside className="hidden w-64 shrink-0 border-r border-zinc-900 bg-zinc-950 p-5 md:block">
      <Link href="/" className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center bg-white">
          <Code2 className="h-5 w-5 text-zinc-950" strokeWidth={2.5} />
        </div>
        <span className="text-lg font-bold tracking-tight">ContribIQ</span>
      </Link>

      <nav className="mt-8 space-y-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);

          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex items-center gap-3 rounded-sm px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={handleLogout}
        className="mt-8 flex w-full items-center gap-2 rounded-sm border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800 hover:text-white"
      >
        <LogOut className="h-4 w-4" /> Sign Out
      </button>
    </aside>
  );
}
