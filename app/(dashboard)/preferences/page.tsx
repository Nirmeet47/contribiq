"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Brain,
  Check,
  CheckCircle2,
  Clock,
  Code2,
  Container,
  Loader2,
  Save,
  Server,
  Smartphone,
  TestTube2,
  Wrench,
  BookOpen,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type MeResponse = {
  interests?: string[] | null;
  timeCommitment?: number | null;
  onboarded?: boolean;
  profileAnalyzed?: boolean;
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
  { label: "< 5", description: "Light contribution rhythm", value: 4 },
  { label: "5-10", description: "Steady weekly availability", value: 7 },
  { label: "10+", description: "High-intent contributor mode", value: 12 },
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

export default function PreferencesPage() {
  const queryClient = useQueryClient();
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [selectedTimeCommitment, setSelectedTimeCommitment] = useState<number | null>(null);
  const [draftInitialized, setDraftInitialized] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const meQuery = useQuery({ queryKey: ["me"], queryFn: fetchMe });

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
      await queryClient.invalidateQueries({ queryKey: ["trending-projects"] });
    },
  });

  function toggleInterest(value: string) {
    setSaveMessage(null);
    setSelectedInterests((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    );
  }

  return (
    <section className="mx-auto w-full max-w-7xl space-y-6 px-6 py-8 sm:px-8 lg:px-12">
        <header className="space-y-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-400">Preferences</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-100">Match preferences</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
              Choose the work you enjoy and the weekly capacity ContribIQ should use when ranking issues.
            </p>
          </div>
        </header>
        <Separator />

        <Card>
          <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1.5">
              <CardTitle>Your matching profile</CardTitle>
              <CardDescription>
                These preferences are private and directly affect your dashboard recommendations.
              </CardDescription>
            </div>
            <Button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={
                !hasChanges ||
                saveMutation.isPending ||
                selectedInterests.length === 0 ||
                selectedTimeCommitment === null
              }
              className="w-full cursor-pointer disabled:cursor-not-allowed sm:w-fit"
            >
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Preferences
            </Button>
          </CardHeader>

          <CardContent>
            {meQuery.isLoading && (
            <Alert>
              <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
              <AlertDescription>Loading preferences...</AlertDescription>
            </Alert>
            )}

            {meQuery.isError && (
              <Alert variant="destructive">
                <AlertDescription>Preferences could not be loaded.</AlertDescription>
              </Alert>
            )}

            {!meQuery.isLoading && !meQuery.isError && (
              <div className="space-y-8">
                <div className="space-y-3">
                  <div>
                    <h2 className="text-sm font-bold text-zinc-100">Contribution interests</h2>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">
                      Pick every area you want your issue feed to consider.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {INTEREST_OPTIONS.map((interest) => {
                      const Icon = interest.icon;
                      const active = selectedInterests.includes(interest.value);

                      return (
                        <button
                          key={interest.value}
                          type="button"
                          onClick={() => toggleInterest(interest.value)}
                          aria-pressed={active}
                          className={`group relative flex min-h-28 cursor-pointer flex-col justify-between rounded-sm border p-4 text-left transition-colors ${
                            active
                              ? "border-emerald-500/40 bg-zinc-900 text-zinc-100"
                              : "border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900/60"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <span
                              className={`inline-flex h-9 w-9 items-center justify-center rounded-sm border ${
                                active
                                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                                  : "border-zinc-800 bg-zinc-900 text-zinc-500 group-hover:text-zinc-300"
                              }`}
                            >
                              <Icon className="h-4 w-4" />
                            </span>
                            <span
                              className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border transition-colors ${
                                active
                                  ? "border-emerald-400 bg-emerald-500 text-zinc-950"
                                  : "border-zinc-700 bg-zinc-950 text-transparent"
                              }`}
                              aria-hidden="true"
                            >
                              <Check className="h-4 w-4" strokeWidth={3.5} />
                            </span>
                          </div>
                          <span className={`text-sm font-bold ${active ? "text-white" : "text-zinc-300"}`}>
                            {interest.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <h2 className="text-sm font-bold text-zinc-100">Weekly capacity</h2>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">
                      This helps avoid issues that are too large for your available time.
                    </p>
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
                          aria-pressed={active}
                          className={`relative min-h-32 cursor-pointer rounded-sm border p-4 text-left transition-colors ${
                            active
                              ? "border-emerald-500/40 bg-zinc-900 text-zinc-100"
                              : "border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900/60"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <Clock className={`h-5 w-5 ${active ? "text-emerald-300" : "text-zinc-500"}`} />
                            <span
                              className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border transition-colors ${
                                active
                                  ? "border-emerald-400 bg-emerald-500 text-zinc-950"
                                  : "border-zinc-700 bg-zinc-950 text-transparent"
                              }`}
                              aria-hidden="true"
                            >
                              <Check className="h-4 w-4" strokeWidth={3.5} />
                            </span>
                          </div>
                          <p className="mt-6 text-2xl font-bold tracking-tight text-white">
                            {option.label}
                            <span className="ml-1 text-sm font-bold text-zinc-400">hrs / week</span>
                          </p>
                          <p className="mt-2 text-xs font-medium text-zinc-500">{option.description}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {saveMutation.isError && (
              <Alert variant="destructive" className="mt-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>Preferences could not be saved.</AlertDescription>
              </div>
              </Alert>
            )}

            {saveMessage && (
              <div className="mt-4 flex items-center gap-2 text-sm font-medium text-emerald-300">
                <CheckCircle2 className="h-4 w-4" />
                <span>{saveMessage}</span>
              </div>
            )}
          </CardContent>
        </Card>
    </section>
  );
}
