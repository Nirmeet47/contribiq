import { getEnvReport, type EnvCheck, type ServiceCheck } from "@/lib/env-checks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const statusStyles = {
  ready: "border-emerald-200 bg-emerald-50 text-emerald-800",
  missing: "border-red-200 bg-red-50 text-red-800",
  invalid: "border-amber-200 bg-amber-50 text-amber-900",
  skipped: "border-zinc-200 bg-zinc-50 text-zinc-600",
};

function StatusBadge({ status }: { status: EnvCheck["status"] }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium ${statusStyles[status]}`}
    >
      {status}
    </span>
  );
}

function groupByCategory(checks: EnvCheck[]) {
  return checks.reduce<Record<string, EnvCheck[]>>((groups, check) => {
    groups[check.category] ??= [];
    groups[check.category].push(check);
    return groups;
  }, {});
}

function ServiceCard({ check }: { check: ServiceCheck }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-zinc-950">{check.name}</h3>
          <p className="mt-2 text-sm leading-6 text-zinc-600">{check.message}</p>
        </div>
        <StatusBadge status={check.status} />
      </div>
    </div>
  );
}

export default async function EnvCheckPage() {
  const report = await getEnvReport();
  const groupedChecks = groupByCategory(report.envChecks);
  const missingRequired = report.envChecks.filter(
    (check) => check.required && check.status !== "ready"
  );

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-8 text-zinc-950 sm:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="flex flex-col gap-4 border-b border-zinc-200 pb-8">
          <div>
            <p className="text-sm font-medium text-zinc-500">ContribIQ setup</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Environment check
            </h1>
          </div>
          <p className="max-w-3xl text-base leading-7 text-zinc-600">
            Fill `.env.local` from `.env.example`, restart `npm run dev`, then
            refresh this page. Secret values are masked here; use
            `/api/env-check` if you want the same report as JSON.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          {report.serviceChecks.map((check) => (
            <ServiceCard key={check.name} check={check} />
          ))}
        </section>

        {missingRequired.length > 0 ? (
          <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-amber-950">
            <h2 className="text-base font-semibold">Next step</h2>
            <p className="mt-2 text-sm leading-6">
              Add the missing or invalid required values below to `.env.local`.
              Next.js loads env files from the project root, and changes require
              a dev server restart.
            </p>
          </section>
        ) : (
          <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
            <h2 className="text-base font-semibold">Required env is present</h2>
            <p className="mt-2 text-sm leading-6">
              The required keys are configured. Check the service cards above
              for live connectivity results.
            </p>
          </section>
        )}

        <section className="flex flex-col gap-6">
          {Object.entries(groupedChecks).map(([category, checks]) => (
            <div key={category} className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
              <div className="border-b border-zinc-200 bg-zinc-100 px-5 py-4">
                <h2 className="text-lg font-semibold">{category}</h2>
              </div>
              <div className="divide-y divide-zinc-100">
                {checks.map((check) => (
                  <div
                    key={check.name}
                    className="grid gap-4 px-5 py-5 lg:grid-cols-[220px_1fr_120px]"
                  >
                    <div>
                      <p className="text-sm font-semibold text-zinc-950">
                        {check.name}
                      </p>
                      <p className="mt-1 text-sm text-zinc-500">
                        {check.label}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm leading-6 text-zinc-700">
                        {check.message}
                      </p>
                      <p className="text-sm leading-6 text-zinc-500">
                        Get it from: {check.source}
                      </p>
                      {check.value ? (
                        <code className="inline-flex rounded-md bg-zinc-100 px-2 py-1 font-mono text-xs text-zinc-700">
                          {check.value}
                        </code>
                      ) : null}
                    </div>
                    <div className="flex items-start lg:justify-end">
                      <StatusBadge status={check.status} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>

        <footer className="text-sm text-zinc-500">
          Last checked: {new Date(report.generatedAt).toLocaleString()}
        </footer>
      </div>
    </main>
  );
}
