"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { PaginationControls } from "@/components/ui/pagination-controls";
import {
  BoolBadge,
  ErrorState,
  LoadingState,
  PageHeader,
  formatDate,
  formatNumber,
} from "@/components/admin/admin-utils";

type UserRow = {
  id: string;
  username: string;
  createdAt: string;
  onboarded: boolean;
  profileAnalyzed: boolean;
  role: "USER" | "ADMIN";
  bookmarks: number;
  workingOn: number;
  contributions: number;
};

type UserFilter = "ALL" | "ADMIN" | "USER";

type UsersResponse = {
  counts: Record<UserFilter, number>;
  users: UserRow[];
  pagination: { page: number; pageSize: number; total: number; hasNextPage: boolean };
};

const FILTERS: Array<{ value: UserFilter; label: string; dot?: string }> = [
  { value: "ALL", label: "All" },
  { value: "ADMIN", label: "Admins", dot: "bg-emerald-400" },
  { value: "USER", label: "Users", dot: "bg-zinc-500" },
];

async function fetchUsers(page: number, filter: UserFilter, search: string) {
  const params = new URLSearchParams({ page: String(page), pageSize: "10" });
  if (filter !== "ALL") params.set("role", filter);
  if (search.trim()) params.set("q", search.trim());
  const response = await fetch(`/api/admin/users?${params}`);
  if (!response.ok) throw new Error("Failed to load users");
  return (await response.json()) as UsersResponse;
}

export function AdminUsersPage() {
  const [filter, setFilter] = useState<UserFilter>("ALL");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [page, setPage] = useState(1);
  const usersQuery = useQuery({
    queryKey: ["admin", "users", page, filter, deferredSearch],
    queryFn: () => fetchUsers(page, filter, deferredSearch),
    placeholderData: keepPreviousData,
  });

  function selectFilter(next: UserFilter) {
    setFilter(next);
    setPage(1);
  }

  const rows = usersQuery.data?.users ?? [];
  const counts = usersQuery.data?.counts;
  const totalPages = usersQuery.data
    ? Math.max(1, Math.ceil(usersQuery.data.pagination.total / usersQuery.data.pagination.pageSize))
    : 1;

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-6 py-8 sm:px-8 lg:px-10">
      <PageHeader title="Users" subtitle="Registered accounts and contribution activity counts." />

      <div className="relative w-full lg:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Search users"
          className="h-11 w-full rounded-sm border border-zinc-800 bg-zinc-900/70 pl-10 pr-3 text-sm font-medium text-white outline-none transition-colors placeholder:text-zinc-500 focus:border-emerald-500"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => selectFilter(item.value)}
            className={`h-9 rounded-sm border px-3 text-sm font-medium transition-colors ${
              filter === item.value
                ? "border-emerald-500 bg-emerald-500 text-zinc-950"
                : "border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700 hover:text-white"
            }`}
          >
            <span className="inline-flex items-center gap-2">
              {item.dot ? <span className={`h-2 w-2 rounded-full ${item.dot}`} /> : null}
              {item.label} - {formatNumber(counts?.[item.value] ?? 0)}
            </span>
          </button>
        ))}
      </div>

      {usersQuery.isLoading ? <LoadingState label="Loading users..." /> : null}
      {usersQuery.isError ? <ErrorState label="Users could not be loaded." /> : null}

      {usersQuery.data ? (
        <section className="overflow-hidden rounded-sm border border-zinc-800 bg-zinc-950 shadow-sm shadow-black/20">
          <div className="overflow-x-auto">
            <table className="min-w-[980px] table-fixed divide-y divide-zinc-800 text-sm">
              <colgroup>
                <col className="w-[24%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
                <col className="w-[14%]" />
                <col className="w-[10%]" />
                <col className="w-[9%]" />
                <col className="w-[9%]" />
                <col className="w-[10%]" />
              </colgroup>
              <thead className="bg-zinc-900/80 text-left text-xs font-medium uppercase text-zinc-500">
                <tr>
                  <th className="px-4 py-3">Username</th>
                  <th className="px-4 py-3">Joined</th>
                  <th className="px-4 py-3">Onboarded</th>
                  <th className="px-4 py-3">Profile analyzed</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Bookmarks</th>
                  <th className="px-4 py-3">Working</th>
                  <th className="px-4 py-3">Contributions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {rows.map((user) => (
                  <tr key={user.id} className="h-[66px] align-middle text-zinc-200 odd:bg-zinc-950 even:bg-zinc-900/70">
                    <td className="px-4 py-4 font-medium text-white">
                      <div className="truncate" title={user.username}>{user.username}</div>
                    </td>
                    <td className="px-4 py-4 font-medium text-zinc-300">{formatDate(user.createdAt)}</td>
                    <td className="px-4 py-4"><BoolBadge value={user.onboarded} /></td>
                    <td className="px-4 py-4"><BoolBadge value={user.profileAnalyzed} /></td>
                    <td className="px-4 py-4">
                      <Badge variant={user.role === "ADMIN" ? "success" : "secondary"}>{user.role}</Badge>
                    </td>
                    <td className="px-4 py-4 font-medium">{formatNumber(user.bookmarks)}</td>
                    <td className="px-4 py-4 font-medium">{formatNumber(user.workingOn)}</td>
                    <td className="px-4 py-4 font-medium">{formatNumber(user.contributions)}</td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm font-medium text-zinc-400">
                      No users match this view.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="px-4 pb-5">
            <PaginationControls
              page={page}
              totalPages={totalPages}
              hasPreviousPage={page > 1}
              hasNextPage={usersQuery.data.pagination.hasNextPage}
              onPageChange={setPage}
              label={`${formatNumber(usersQuery.data.pagination.total)} users - page`}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
