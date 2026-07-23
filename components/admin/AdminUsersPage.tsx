"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BoolBadge, ErrorState, LoadingState, PageHeader, formatDate, formatNumber } from "@/components/admin/admin-utils";

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

type UsersResponse = {
  users: UserRow[];
  pagination: { page: number; pageSize: number; total: number; hasNextPage: boolean };
};

async function fetchUsers(page: number) {
  const params = new URLSearchParams({ page: String(page), pageSize: "10" });
  const response = await fetch(`/api/admin/users?${params}`);
  if (!response.ok) throw new Error("Failed to load users");
  return (await response.json()) as UsersResponse;
}

export function AdminUsersPage() {
  const [page, setPage] = useState(1);
  const usersQuery = useQuery({
    queryKey: ["admin", "users", page],
    queryFn: () => fetchUsers(page),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-6 sm:px-8 lg:px-10">
      <PageHeader title="Users" subtitle="Registered accounts and contribution activity counts." />

      {usersQuery.isLoading ? <LoadingState label="Loading users..." /> : null}
      {usersQuery.isError ? <ErrorState label="Users could not be loaded." /> : null}

      {usersQuery.data ? (
        <section className="overflow-hidden rounded-sm border border-zinc-800 bg-zinc-950">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-800 text-sm">
              <thead className="bg-zinc-900/60 text-left text-xs font-bold uppercase text-zinc-400">
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
              <tbody className="divide-y divide-zinc-900">
                {usersQuery.data.users.map((user) => (
                  <tr key={user.id} className="text-zinc-200">
                    <td className="px-4 py-4">
                      <div className="font-semibold text-white">{user.username}</div>
                      <div className="mt-1 text-xs text-zinc-500">{user.id}</div>
                    </td>
                    <td className="px-4 py-4">{formatDate(user.createdAt)}</td>
                    <td className="px-4 py-4"><BoolBadge value={user.onboarded} /></td>
                    <td className="px-4 py-4"><BoolBadge value={user.profileAnalyzed} /></td>
                    <td className="px-4 py-4">
                      <Badge variant={user.role === "ADMIN" ? "success" : "secondary"}>{user.role}</Badge>
                    </td>
                    <td className="px-4 py-4">{formatNumber(user.bookmarks)}</td>
                    <td className="px-4 py-4">{formatNumber(user.workingOn)}</td>
                    <td className="px-4 py-4">{formatNumber(user.contributions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} total={usersQuery.data.pagination.total} hasNextPage={usersQuery.data.pagination.hasNextPage} onPageChange={setPage} />
        </section>
      ) : null}
    </div>
  );
}

function Pagination({ page, total, hasNextPage, onPageChange }: { page: number; total: number; hasNextPage: boolean; onPageChange: (page: number) => void }) {
  return (
    <div className="flex items-center justify-between border-t border-zinc-800 px-4 py-3 text-sm font-medium text-zinc-300">
      <span>{formatNumber(total)} total</span>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" disabled={page === 1} onClick={() => onPageChange(page - 1)}>Previous</Button>
        <Button type="button" size="sm" variant="outline" disabled={!hasNextPage} onClick={() => onPageChange(page + 1)}>Next</Button>
      </div>
    </div>
  );
}
