"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Brain,
  CheckCircle2,
  Clock,
  Code2,
  Container,
  Database,
  Loader2,
  RefreshCw,
  Save,
  Server,
  Smartphone,
  TestTube2,
  Wrench,
  BookOpen,
} from "lucide-react";
import { useEffect, useState } from "react";

type MeResponse = {
  interests?: string[] | null;
  timeCommitment?: number | null;
  onboarded?: boolean;
  profileAnalyzed?: boolean;
};

type PipelineStatus = {
  generatedAt: string;
  database: {
    repos: number;
    openIssues: number;
    classifiedOpenIssues: number;
    issueEmbeddings: number;
    skillEmbeddings: number;
    userMatches: number;
    strongUserMatches: number;
  };
  queues: {
    available: boolean;
    error?: string;
    queues: Array<{
      name: string;
      counts: Record<string, number>;
    }>;
  };
};

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
  { label: "< 5 hrs / week", value: 4 },
  { label: "5-10 hrs / week", value: 7 },
  { label: "10+ hrs / week", value: 12 },
];

async function readJson<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(`Expected JSON, got ${contentType || "unknown content type"}`);
  }

  return (await response.json()) as T;
}

async function fetchMe() {
  const response = await fetch("/api/me");
  if (response.status === 401) {
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  if (!response.ok) throw new Error(`Failed to load profile: ${response.status}`);
  return readJson<MeResponse>(response);
}

async function savePreferences({
  interests,
  timeCommitment,
}: {
  interests: string[];
  timeCommitment: number;
}) {
  const response = await fetch("/api/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ interests, timeCommitment }),
  });

  const payload = await readJson<{ success?: boolean; error?: unknown }>(response);
  if (!response.ok || !payload.success) {
    throw new Error(typeof payload.error === "string" ? payload.error : "Failed to save preferences");
  }

  return payload;
}

async function fetchPipelineStatus() {
  const response = await fetch("/api/pipeline/status");
  if (response.status === 401) {
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  if (!response.ok) throw new Error(`Failed to load pipeline status: ${response.status}`);
  return readJson<PipelineStatus>(response);
}

function percent(part: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

function StatCard({ label, value, detail }: { label: string; value: number | string; detail: string }) {
  return (
    <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-4">
      <Database className="mb-3 h-4 w-4 text-zinc-500" />
      <p className="text-xl font-bold text-zinc-100">{value}</p>
      <p className="mt-1 text-xs font-medium text-zinc-500">{label}</p>
      <p className="mt-2 text-[11px] leading-4 text-zinc-600">{detail}</p>
    </div>
  );
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [selectedTimeCommitment, setSelectedTimeCommitment] = useState<number | null>(null);
  const [draftInitialized, setDraftInitialized] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const meQuery = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const statusQuery = useQuery({
    queryKey: ["pipeline-status"],
    queryFn: fetchPipelineStatus,
    refetchInterval: 15000,
  });

  useEffect(() => {
    if (meQuery.data && !draftInitialized) {
      void Promise.resolve().then(() => {
        setSelectedInterests(meQuery.data.interests ?? []);
        setSelectedTimeCommitment(
          meQuery.data.timeCommitment && meQuery.data.timeCommitment > 0
            ? meQuery.data.timeCommitment
            : null
        );
        setDraftInitialized(true);
      });
    }
  }, [draftInitialized, meQuery.data]);

  const savedInterests = meQuery.data?.interests ?? [];
  const savedTimeCommitment = meQuery.data?.timeCommitment ?? null;
  const hasChanges =
    JSON.stringify([...selectedInterests].sort()) !== JSON.stringify([...savedInterests].sort()) ||
    selectedTimeCommitment !== (savedTimeCommitment && savedTimeCommitment > 0 ? savedTimeCommitment : null);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (selectedTimeCommitment === null) throw new Error("Pick a time commitment");
      return savePreferences({
        interests: selectedInterests,
        timeCommitment: selectedTimeCommitment,
      });
    },
    onSuccess: async () => {
      setSaveMessage("Preferences saved. Match refresh has been queued if your profile is ready.");
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      await queryClient.invalidateQueries({ queryKey: ["feed"] });
      await queryClient.invalidateQueries({ queryKey: ["trending-repos"] });
      await queryClient.invalidateQueries({ queryKey: ["pipeline-status"] });
    },
  });

  function toggleInterest(value: string) {
    setSaveMessage(null);
    setSelectedInterests((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    );
  }

  const status = statusQuery.data;
  const classifiedPercent = status
    ? percent(status.database.classifiedOpenIssues, status.database.openIssues)
    : 0;

  return (
    <section className="mx-auto max-w-6xl space-y-6 px-6 py-8 sm:px-8">
        <header className="flex flex-col gap-4 border-b border-zinc-900 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-400">Control panel</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-100">Settings</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
              Edit match preferences and see whether the backend pipeline is actually ready.
            </p>
          </div>

          <button
            type="button"
            onClick={() => statusQuery.refetch()}
            className="inline-flex items-center gap-2 rounded-sm border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-bold text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh Status
          </button>
        </header>

        <section className="rounded-sm border border-zinc-800 bg-zinc-950 p-5">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-zinc-100">Match preferences</h2>
              <p className="mt-1 text-sm leading-6 text-zinc-500">
                These are stored on your user row and directly affect recommendations.
              </p>
            </div>
            <button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={
                !hasChanges ||
                saveMutation.isPending ||
                selectedInterests.length === 0 ||
                selectedTimeCommitment === null
              }
              className="inline-flex items-center justify-center gap-2 rounded-sm bg-emerald-500 px-4 py-2 text-sm font-bold text-zinc-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
            >
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Preferences
            </button>
          </div>

          {meQuery.isLoading && (
            <div className="flex items-center gap-3 rounded-sm border border-zinc-800 bg-zinc-900/40 p-4 text-sm font-medium text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
              Loading preferences...
            </div>
          )}

          {meQuery.isError && (
            <div className="rounded-sm border border-red-500/30 bg-red-500/10 p-4 text-sm font-medium text-red-300">
              Preferences could not be loaded.
            </div>
          )}

          {!meQuery.isLoading && !meQuery.isError && (
            <div className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {INTEREST_OPTIONS.map((interest) => {
                  const Icon = interest.icon;
                  const active = selectedInterests.includes(interest.value);

                  return (
                    <button
                      key={interest.value}
                      type="button"
                      onClick={() => toggleInterest(interest.value)}
                      className={`flex min-h-24 flex-col justify-between rounded-sm border p-4 text-left transition-colors ${
                        active
                          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                          : "border-zinc-800 bg-zinc-900/40 text-zinc-300 hover:border-zinc-700"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <Icon className={`h-5 w-5 ${active ? "text-emerald-400" : "text-zinc-500"}`} />
                        <span className={`h-4 w-4 rounded-sm border ${active ? "border-emerald-400 bg-emerald-400" : "border-zinc-700"}`} />
                      </div>
                      <span className="text-sm font-bold">{interest.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {TIME_OPTIONS.map((option) => {
                  const active = selectedTimeCommitment === option.value;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setSaveMessage(null);
                        setSelectedTimeCommitment(option.value);
                      }}
                      className={`rounded-sm border p-4 text-left transition-colors ${
                        active
                          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                          : "border-zinc-800 bg-zinc-900/40 text-zinc-300 hover:border-zinc-700"
                      }`}
                    >
                      <Clock className={`mb-5 h-5 w-5 ${active ? "text-emerald-400" : "text-zinc-500"}`} />
                      <p className="text-base font-bold">{option.label}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {saveMutation.isError && (
            <div className="mt-4 rounded-sm border border-red-500/30 bg-red-500/10 p-4 text-sm font-medium text-red-300">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Preferences could not be saved.
              </div>
            </div>
          )}

          {saveMessage && (
            <div className="mt-4 rounded-sm border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm font-medium text-emerald-300">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                {saveMessage}
              </div>
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-zinc-100">Pipeline status</h2>
            <p className="mt-1 text-sm leading-6 text-zinc-500">
              `npm run workers` runs these background jobs: fetch issues, classify issues, score matches, and summarize merged PRs.
            </p>
          </div>

          {statusQuery.isLoading && (
            <div className="flex items-center gap-3 rounded-sm border border-zinc-800 bg-zinc-950 p-4 text-sm font-medium text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
              Loading pipeline status...
            </div>
          )}

          {statusQuery.isError && (
            <div className="rounded-sm border border-red-500/30 bg-red-500/10 p-4 text-sm font-medium text-red-300">
              Pipeline status could not be loaded.
            </div>
          )}

          {status && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Repos" value={status.database.repos} detail="Curated repositories in Postgres." />
                <StatCard label="Open issues" value={status.database.openIssues} detail="Fetched from GitHub by the issue worker." />
                <StatCard
                  label="Classified"
                  value={`${status.database.classifiedOpenIssues} (${classifiedPercent}%)`}
                  detail="Issues with AI difficulty, skills, type, and summary."
                />
                <StatCard
                  label="Your strong matches"
                  value={status.database.strongUserMatches}
                  detail={`${status.database.userMatches} total stored match rows for you.`}
                />
              </div>

              <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-zinc-100">Worker queues</h3>
                    <p className="mt-1 text-xs font-medium text-zinc-500">
                      Last checked {new Date(status.generatedAt).toLocaleString()}
                    </p>
                  </div>
                  <span className={`rounded-sm border px-2 py-1 text-xs font-bold ${status.queues.available ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-red-500/30 bg-red-500/10 text-red-300"}`}>
                    {status.queues.available ? "Redis connected" : "Redis unavailable"}
                  </span>
                </div>

                {status.queues.available ? (
                  <div className="grid gap-3 lg:grid-cols-2">
                    {status.queues.queues.map((queue) => (
                      <div key={queue.name} className="rounded-sm border border-zinc-800 bg-zinc-900/40 p-4">
                        <p className="text-sm font-bold text-zinc-100">{queue.name}</p>
                        <div className="mt-3 grid grid-cols-5 gap-2">
                          {Object.entries(queue.counts).map(([key, value]) => (
                            <div key={key} className="rounded-sm bg-zinc-950 p-2">
                              <p className="text-sm font-bold text-zinc-100">{value}</p>
                              <p className="text-[10px] font-medium uppercase text-zinc-600">{key}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-sm border border-red-500/30 bg-red-500/10 p-4 text-sm font-medium text-red-300">
                    {status.queues.error || "Queue status is unavailable."}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
    </section>
  );
}
