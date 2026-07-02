import { Loader2 } from "lucide-react";

export function DashboardLoading() {
  return (
    <main className="fixed inset-0 z-50 flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-50">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
        <p className="text-sm font-medium text-zinc-400">Loading your profile...</p>
      </div>
    </main>
  );
}
