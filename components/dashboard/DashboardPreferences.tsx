import {
  ArrowRight,
  BookOpen,
  Brain,
  Clock,
  Code2,
  Container,
  Loader2,
  Server,
  Smartphone,
  TestTube2,
  Wrench,
} from "lucide-react";

const INTEREST_OPTIONS = [
  { value: "frontend", label: "Frontend", icon: Code2 },
  { value: "backend", label: "Backend", icon: Server },
  { value: "ai", label: "AI", icon: Brain },
  { value: "devops", label: "DevOps", icon: Container },
  { value: "docs", label: "Docs", icon: BookOpen },
  { value: "testing", label: "Testing", icon: TestTube2 },
  { value: "tools", label: "Tools", icon: Wrench },
  { value: "mobile", label: "Mobile", icon: Smartphone },
];

const TIME_OPTIONS = [
  { label: "< 5 hrs / week", value: 4, detail: "Light weekly pace" },
  { label: "5-10 hrs / week", value: 7, detail: "Steady contribution rhythm" },
  { label: "10+ hrs / week", value: 12, detail: "Deep focus capacity" },
];

export function DashboardPreferences({
  step,
  selectedInterests,
  selectedTimeCommitment,
  saving,
  onToggleInterest,
  onSelectTimeCommitment,
  onNext,
  onBack,
  onComplete,
}: {
  step: "interests" | "time_commitment";
  selectedInterests: string[];
  selectedTimeCommitment: number | null;
  saving: boolean;
  onToggleInterest: (interest: string) => void;
  onSelectTimeCommitment: (hours: number) => void;
  onNext: () => void;
  onBack: () => void;
  onComplete: () => void;
}) {
  if (step === "interests") {
    return (
      <main className="fixed inset-0 z-50 min-h-screen overflow-y-auto bg-zinc-950 text-zinc-50 font-sans selection:bg-emerald-500/30">
        <DashboardGrid />
        <div className="relative z-10 mx-auto max-w-4xl px-6 py-16 space-y-10">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Step 3 of 4 - What do you want to work on?</h1>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {INTEREST_OPTIONS.map((interest) => {
              const Icon = interest.icon;
              const active = selectedInterests.includes(interest.value);

              return (
                <button
                  key={interest.value}
                  type="button"
                  onClick={() => onToggleInterest(interest.value)}
                  className={`flex min-h-32 flex-col justify-between rounded-sm border p-4 text-left transition-all ${
                    active
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-300 shadow-[0_0_0_1px_rgba(16,185,129,0.15)]"
                      : "border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900/70"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <Icon className={`h-5 w-5 ${active ? "text-emerald-400" : "text-zinc-500"}`} />
                    <span
                      className={`flex h-5 w-9 items-center rounded-full border p-0.5 transition-colors ${
                        active ? "border-emerald-500/40 bg-emerald-500/20" : "border-zinc-700 bg-zinc-900"
                      }`}
                    >
                      <span
                        className={`h-3.5 w-3.5 rounded-full transition-transform ${
                          active ? "translate-x-3.5 bg-emerald-400" : "translate-x-0 bg-zinc-600"
                        }`}
                      />
                    </span>
                  </div>
                  <span className="text-base font-bold">{interest.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex justify-end">
            <button
              onClick={onNext}
              disabled={selectedInterests.length === 0}
              className="flex items-center gap-2 rounded-sm bg-emerald-500 px-6 py-3 text-sm font-bold text-zinc-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
            >
              Continue <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="fixed inset-0 z-50 min-h-screen overflow-y-auto bg-zinc-950 text-zinc-50 font-sans selection:bg-emerald-500/30">
      <DashboardGrid />
      <div className="relative z-10 mx-auto max-w-3xl px-6 py-16 space-y-10">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Step 4 of 4 - How much time can you commit?</h1>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {TIME_OPTIONS.map((option) => {
            const active = selectedTimeCommitment === option.value;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onSelectTimeCommitment(option.value)}
                className={`min-h-36 rounded-sm border p-5 text-left transition-all ${
                  active
                    ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                    : "border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900/70"
                }`}
              >
                <div className="mb-8 flex items-center justify-between">
                  <Clock className={`h-5 w-5 ${active ? "text-emerald-400" : "text-zinc-500"}`} />
                  <span className={`h-4 w-4 rounded-sm border ${active ? "border-emerald-400 bg-emerald-400" : "border-zinc-700 bg-zinc-900"}`} />
                </div>
                <div className="space-y-1">
                  <p className="text-xl font-bold">{option.label}</p>
                  <p className="text-xs font-medium text-zinc-500">{option.detail}</p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex justify-between">
          <button
            onClick={onBack}
            className="rounded-sm border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm font-bold text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
          >
            Back
          </button>
          <button
            onClick={onComplete}
            disabled={selectedTimeCommitment === null || saving}
            className="flex items-center gap-2 rounded-sm bg-emerald-500 px-6 py-3 text-sm font-bold text-zinc-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Let's Go"} {!saving && <ArrowRight className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </main>
  );
}

function DashboardGrid() {
  return (
    <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
  );
}
