import Link from "next/link";
import { Inbox } from "lucide-react";
import { AppShell } from "@/app/app-shell";

export default function MatchesNotFoundPage() {
  return (
    <AppShell>
      <section className="flex min-h-screen items-center justify-center p-6 sm:p-8">
        <div className="w-full max-w-md rounded-sm border border-zinc-800 bg-zinc-950 p-6">
          <Inbox className="mb-5 h-8 w-8 text-zinc-500" />
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Page not found</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-zinc-100">Matches is not available yet</h1>
          <p className="mt-3 text-sm font-medium leading-6 text-zinc-500">
            This section is not built as a standalone page. Your recommended issues are on the dashboard.
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-flex rounded-sm bg-white px-4 py-2 text-sm font-bold text-zinc-950 transition-colors hover:bg-zinc-200"
          >
            Back to dashboard
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
