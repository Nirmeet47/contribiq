export function IssueLoadingSkeleton() {
  return (
    <section className="p-6 text-zinc-50 sm:p-8">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="h-40 animate-pulse rounded-sm border border-zinc-800 bg-zinc-900" />
          <div className="h-96 animate-pulse rounded-sm border border-zinc-800 bg-zinc-900" />
        </div>
        <div className="space-y-6">
          <div className="h-56 animate-pulse rounded-sm border border-zinc-800 bg-zinc-900" />
          <div className="h-40 animate-pulse rounded-sm border border-zinc-800 bg-zinc-900" />
          <div className="h-36 animate-pulse rounded-sm border border-zinc-800 bg-zinc-900" />
        </div>
      </div>
    </section>
  );
}
