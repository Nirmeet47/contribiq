"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Code2, GitPullRequest, ServerCog, UsersRound } from "lucide-react";

const NAV_ITEMS = [
  { label: "Overview", icon: BarChart3, href: "/admin" },
  { label: "Repos", icon: ServerCog, href: "/admin/repos" },
  { label: "Issues", icon: GitPullRequest, href: "/admin/issues" },
  { label: "Users", icon: UsersRound, href: "/admin/users" },
];

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-zinc-900 bg-zinc-950 p-5 md:block">
      <Link href="/admin" className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center bg-emerald-400">
          <Code2 className="h-5 w-5 text-zinc-950" strokeWidth={2.5} />
        </div>
        <div>
          <span className="block text-lg font-bold tracking-tight">ContribIQ</span>
          <span className="block text-xs font-medium text-emerald-300">Admin</span>
        </div>
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
    </aside>
  );
}
