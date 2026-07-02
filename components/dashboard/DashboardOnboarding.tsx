import type { ReactNode } from "react";
import {
  Brain,
  CheckCircle2,
  Code2,
  Fingerprint,
  GitMerge,
  Loader2,
  XCircle,
} from "lucide-react";

const STEP_ORDER = ["fetching", "analysing", "writing", "embedding", "done"];

const STEP_META: Record<string, { icon: ReactNode; label: string }> = {
  fetching: { icon: <GitMerge className="h-5 w-5" />, label: "Fetching GitHub Data" },
  analysing: { icon: <Brain className="h-5 w-5" />, label: "AI Analysis" },
  writing: { icon: <Code2 className="h-5 w-5" />, label: "Saving Profile" },
  embedding: { icon: <Fingerprint className="h-5 w-5" />, label: "Building Fingerprint" },
  done: { icon: <CheckCircle2 className="h-5 w-5" />, label: "Complete" },
  error: { icon: <XCircle className="h-5 w-5" />, label: "Error" },
};

export function DashboardOnboarding({
  currentStep,
  message,
  isDone,
  isError,
  onRetry,
}: {
  currentStep: string;
  message: string;
  isDone: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const currentIndex = STEP_ORDER.indexOf(currentStep);
  const progressPercent = isDone
    ? 100
    : isError
      ? Math.max((currentIndex / (STEP_ORDER.length - 1)) * 100, 10)
      : Math.max(((currentIndex + 0.5) / (STEP_ORDER.length - 1)) * 100, 5);

  return (
    <main className="fixed inset-0 z-50 flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-6 text-zinc-50 font-sans">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
      <div className="relative z-10 w-full max-w-lg space-y-8">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-sm bg-emerald-500 mb-4">
            {isDone ? (
              <CheckCircle2 className="h-7 w-7 text-zinc-950" />
            ) : isError ? (
              <XCircle className="h-7 w-7 text-zinc-950" />
            ) : (
              <Loader2 className="h-7 w-7 text-zinc-950 animate-spin" />
            )}
          </div>
          <h1 className="text-3xl font-bold tracking-tight">
            {isDone ? "You're All Set" : isError ? "Analysis Failed" : "Analyzing Your Profile"}
          </h1>
          <p className="text-sm text-zinc-400 font-medium">{message}</p>
        </div>

        <div className="relative h-1.5 w-full overflow-hidden rounded-sm bg-zinc-900 border border-zinc-800">
          <div
            className={`absolute left-0 top-0 h-full transition-all duration-700 ease-out rounded-sm ${isError ? "bg-red-500" : "bg-emerald-500"}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="rounded-sm border border-zinc-800 bg-zinc-950 divide-y divide-zinc-800/50">
          {STEP_ORDER.slice(0, -1).map((step, index) => {
            const meta = STEP_META[step];
            const isActive = currentStep === step;
            const isCompleted = currentIndex > index || isDone;

            return (
              <div
                key={step}
                className={`flex items-center gap-4 px-5 py-4 transition-colors ${isActive ? "bg-zinc-900/50" : ""}`}
              >
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-sm border transition-all ${
                    isCompleted
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                      : isActive
                        ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-400"
                        : "border-zinc-800 bg-zinc-900 text-zinc-600"
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : isActive ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <span className="text-xs font-bold">{index + 1}</span>
                  )}
                </div>
                <div className="flex-1">
                  <p className={`text-sm font-semibold ${isCompleted || isActive ? "text-zinc-100" : "text-zinc-500"}`}>
                    {meta.label}
                  </p>
                </div>
                <div className={`transition-colors ${isCompleted ? "text-emerald-500" : isActive ? "text-zinc-300" : "text-zinc-700"}`}>
                  {meta.icon}
                </div>
              </div>
            );
          })}
        </div>

        {isError && (
          <button
            onClick={onRetry}
            className="w-full rounded-sm bg-white px-4 py-3 text-sm font-bold text-zinc-950 transition-colors hover:bg-zinc-200"
          >
            Try Again
          </button>
        )}
      </div>
    </main>
  );
}
