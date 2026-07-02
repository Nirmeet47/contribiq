"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { DashboardHome } from "@/components/dashboard/DashboardHome";
import { DashboardLoading } from "@/components/dashboard/DashboardLoading";
import { DashboardOnboarding } from "@/components/dashboard/DashboardOnboarding";
import { DashboardPreferences } from "@/components/dashboard/DashboardPreferences";
import { DashboardSkillReview } from "@/components/dashboard/DashboardSkillReview";
import { createClient } from "@/utils/supabase/client";

type SkillLevel = "strong" | "moderate" | "learning";

type Skill = {
  name: string;
  level: SkillLevel;
  confidence: number;
  repoCount: number;
  commitCount: number;
};

type DbUser = {
  name?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  onboarded?: boolean;
  profileAnalyzed?: boolean;
  interests?: string[];
  timeCommitment?: number;
};

type ViewState = "loading" | "onboarding" | "skills_review" | "interests" | "time_commitment" | "dashboard";

type SkillsSummary = {
  totalCommits: number;
  totalRepos: number;
  mergedPRs: number;
};

async function readJson<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    throw new Error(`Expected JSON from ${response.url || "request"}, got ${contentType || "unknown content type"}`);
  }

  return (await response.json()) as T;
}

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [dbUser, setDbUser] = useState<DbUser | null>(null);
  const [viewState, setViewState] = useState<ViewState>("loading");
  const [currentStep, setCurrentStep] = useState("fetching");
  const [message, setMessage] = useState("Connecting to GitHub...");
  const [isDone, setIsDone] = useState(false);
  const [isError, setIsError] = useState(false);
  const [sseRetryToken, setSseRetryToken] = useState(0);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [summary, setSummary] = useState<SkillsSummary>({ totalCommits: 0, totalRepos: 0, mergedPRs: 0 });
  const [saving, setSaving] = useState(false);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [selectedTimeCommitment, setSelectedTimeCommitment] = useState<number | null>(null);
  const sseStarted = useRef(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const fetchSkills = useCallback(async () => {
    try {
      const response = await fetch("/api/me/skills");
      if (response.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!response.ok) throw new Error(`Failed to fetch skills: ${response.status}`);

      const data = await readJson<{ skills?: Skill[]; summary?: SkillsSummary }>(response);
      setSkills(data.skills ?? []);
      if (data.summary) setSummary(data.summary);
    } catch (error) {
      console.error("Failed to fetch skills", error);
    }
  }, []);

  useEffect(() => {
    async function init() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        window.location.href = "/login";
        return;
      }
      setUser(data.user);

      try {
        const response = await fetch("/api/me");
        if (response.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (!response.ok) throw new Error(`Failed to load DB user: ${response.status}`);

        const profile = await readJson<DbUser & { error?: unknown }>(response);
        if (!profile || profile.error) return;

        setDbUser(profile);
        const hasInterests = (profile.interests?.length ?? 0) > 0;
        const hasTimeCommitment = (profile.timeCommitment ?? 0) > 0;

        if (profile.onboarded === false || !hasInterests || !hasTimeCommitment) {
          setSelectedInterests(profile.interests ?? []);
          setSelectedTimeCommitment(profile.timeCommitment && profile.timeCommitment > 0 ? profile.timeCommitment : null);

          if (profile.profileAnalyzed) {
            await fetchSkills();
            setViewState(!hasInterests ? "interests" : !hasTimeCommitment ? "time_commitment" : "skills_review");
          } else {
            setViewState("onboarding");
          }
          return;
        }

        await fetchSkills();
        setViewState("dashboard");
      } catch (error) {
        console.error("Failed to load DB user", error);
      }
    }

    void init();
  }, [fetchSkills, supabase]);

  useEffect(() => {
    if (viewState !== "onboarding" || sseStarted.current) return;

    if (dbUser?.onboarded) {
      void Promise.resolve().then(async () => {
        await fetchSkills();
        setViewState("dashboard");
      });
      return;
    }

    sseStarted.current = true;
    setIsError(false);
    setIsDone(false);
    setCurrentStep("fetching");
    setMessage("Connecting to GitHub...");

    const eventSource = new EventSource("/api/onboarding/progress");
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data) as { step: string; message: string };
      setIsError(false);
      setCurrentStep(data.step);
      setMessage(data.message);

      if (data.step === "done") {
        setIsDone(true);
        eventSource.close();
        eventSourceRef.current = null;
        window.setTimeout(() => {
          void fetchSkills();
          setViewState("skills_review");
        }, 2000);
      }

      if (data.step === "error") {
        setIsError(true);
        eventSource.close();
        eventSourceRef.current = null;
      }
    };

    eventSource.onerror = () => {
      setIsError(true);
      setMessage("Lost connection to the analysis server.");
      eventSource.close();
      eventSourceRef.current = null;
    };

    return () => {
      eventSource.close();
      if (eventSourceRef.current === eventSource) {
        eventSourceRef.current = null;
      }
    };
  }, [dbUser?.onboarded, fetchSkills, sseRetryToken, viewState]);

  function retryOnboardingAnalysis() {
    if (dbUser?.onboarded) {
      void fetchSkills();
      setViewState("dashboard");
      return;
    }

    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    sseStarted.current = false;
    setIsError(false);
    setIsDone(false);
    setCurrentStep("fetching");
    setMessage("Connecting to GitHub...");
    setViewState("onboarding");
    setSseRetryToken((value) => value + 1);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  async function handleSaveSkills() {
    setSaving(true);
    try {
      await fetch("/api/me/skills", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skills: skills.map((skill) => ({ name: skill.name, level: skill.level })),
        }),
      });
    } catch (error) {
      console.error("Failed to save skills:", error);
    } finally {
      setSaving(false);
    }
  }

  function toggleInterest(interest: string) {
    setSelectedInterests((current) =>
      current.includes(interest) ? current.filter((value) => value !== interest) : [...current, interest]
    );
  }

  async function handleCompletePreferences() {
    if (selectedInterests.length === 0 || selectedTimeCommitment === null) return;

    setSaving(true);
    try {
      const response = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interests: selectedInterests,
          timeCommitment: selectedTimeCommitment,
          onboarded: true,
        }),
      });

      if (!response.ok) throw new Error("Failed to save onboarding preferences");

      await fetchSkills();
      setViewState("dashboard");
    } catch (error) {
      console.error("Failed to complete onboarding:", error);
    } finally {
      setSaving(false);
    }
  }

  if (viewState === "loading") {
    return <DashboardLoading />;
  }

  if (viewState === "onboarding") {
    return (
      <DashboardOnboarding
        currentStep={currentStep}
        message={message}
        isDone={isDone}
        isError={isError}
        onRetry={retryOnboardingAnalysis}
      />
    );
  }

  if (viewState === "skills_review") {
    return (
      <DashboardSkillReview
        skills={skills}
        setSkills={setSkills}
        summary={summary}
        saving={saving}
        onSave={handleSaveSkills}
        onContinue={() => setViewState("interests")}
      />
    );
  }

  if (viewState === "interests" || viewState === "time_commitment") {
    return (
      <DashboardPreferences
        step={viewState}
        selectedInterests={selectedInterests}
        selectedTimeCommitment={selectedTimeCommitment}
        saving={saving}
        onToggleInterest={toggleInterest}
        onSelectTimeCommitment={setSelectedTimeCommitment}
        onNext={() => setViewState("time_commitment")}
        onBack={() => setViewState("interests")}
        onComplete={handleCompletePreferences}
      />
    );
  }

  const name = dbUser?.name || user?.user_metadata?.full_name || "Developer";

  return <DashboardHome name={name} onLogout={handleLogout} />;
}
