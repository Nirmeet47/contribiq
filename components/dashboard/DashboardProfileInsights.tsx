"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";
import {
  BookOpen,
  Brain,
  Clock,
  Code2,
  Container,
  Loader2,
  Pencil,
  Server,
  Smartphone,
  TestTube2,
  Wrench,
} from "lucide-react";

type SkillLevel = "strong" | "moderate" | "learning";

type Skill = {
  id?: string;
  name: string;
  level: SkillLevel;
  confidence: number;
};

type MeResponse = {
  interests?: string[] | null;
  timeCommitment?: number | null;
  skillProfile?: {
    skills?: Skill[];
  } | null;
};

const INTERESTS = [
  { value: "frontend", label: "Frontend", icon: Code2 },
  { value: "backend", label: "Backend", icon: Server },
  { value: "ai", label: "AI", icon: Brain },
  { value: "devops", label: "DevOps", icon: Container },
  { value: "docs", label: "Docs", icon: BookOpen },
  { value: "testing", label: "Testing", icon: TestTube2 },
  { value: "tools", label: "Tools", icon: Wrench },
  { value: "mobile", label: "Mobile", icon: Smartphone },
];

async function fetchMe() {
  const response = await fetch("/api/me");
  if (!response.ok) throw new Error("Failed to load profile");
  return (await response.json()) as MeResponse;
}

function timeLabel(value: number | null | undefined) {
  if (!value || value <= 0) return "Not set";
  if (value <= 4) return "<5";
  if (value <= 7) return "5-10";
  return "10+";
}

function capacitySegment(value: number | null | undefined) {
  if (!value || value <= 0) return -1;
  if (value <= 4) return 0;
  if (value <= 7) return 1;
  return 2;
}

export function DashboardProfileInsights() {
  const meQuery = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const skills = (meQuery.data?.skillProfile?.skills ?? [])
    .toSorted((a, b) => b.confidence - a.confidence)
    .slice(0, 6);
  const skillData =
    skills.length > 0
      ? skills.map((skill) => ({
          skill: skill.name,
          confidence: Math.round(skill.confidence * 100),
          level: skill.level,
        }))
      : [
          { skill: "Frontend", confidence: 0, level: "learning" as SkillLevel },
          { skill: "Backend", confidence: 0, level: "learning" as SkillLevel },
          { skill: "Testing", confidence: 0, level: "learning" as SkillLevel },
        ];

  const selectedInterests = new Set(meQuery.data?.interests ?? []);
  const activeInterests = INTERESTS.filter((interest) => selectedInterests.has(interest.value));
  const timeCommitment = meQuery.data?.timeCommitment ?? null;
  const activeCapacitySegment = capacitySegment(timeCommitment);

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Matching profile</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
          Skills and preferences that shape your repository recommendations.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-5">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-zinc-100">Skills</h2>
              <p className="mt-1 text-sm leading-6 text-zinc-500">Your strongest match signals at a glance.</p>
            </div>
            <Link
              href="/skills"
              className="inline-flex items-center justify-center rounded-sm border border-zinc-800 bg-zinc-900 p-2 text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white"
              aria-label="Edit skills"
              title="Edit skills"
            >
              <Pencil className="h-4 w-4" />
            </Link>
          </div>

          {meQuery.isLoading ? (
            <div className="flex h-80 items-center justify-center rounded-sm border border-zinc-900 bg-zinc-900/30 text-sm font-medium text-zinc-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin text-emerald-400" />
              Loading skills
            </div>
          ) : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={skillData} outerRadius="72%">
                  <PolarGrid stroke="#3f3f46" />
                  <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                  <PolarAngleAxis dataKey="skill" tick={{ fill: "#a1a1aa", fontSize: 11, fontWeight: 700 }} />
                  <Radar dataKey="confidence" stroke="#34d399" fill="#34d399" fillOpacity={0.3} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-5">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-zinc-100">Preferences</h2>
              <p className="mt-1 text-sm leading-6 text-zinc-500">
                Interests and weekly capacity used by your matcher.
              </p>
            </div>
            <Link
              href="/settings"
              className="inline-flex items-center gap-2 rounded-sm bg-emerald-500 px-3 py-2 text-sm font-bold text-zinc-950 transition-colors hover:bg-emerald-400"
            >
              Edit
            </Link>
          </div>

          {meQuery.isLoading ? (
            <div className="flex h-80 items-center justify-center rounded-sm border border-zinc-900 bg-zinc-900/30 text-sm font-medium text-zinc-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin text-sky-400" />
              Loading preferences
            </div>
          ) : (
            <div className="space-y-4">
              {activeInterests.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {activeInterests.map((interest) => {
                    const Icon = interest.icon;

                    return (
                      <div
                        key={interest.value}
                        className="flex items-center gap-3 rounded-sm border border-zinc-800 bg-zinc-900/40 px-3 py-3"
                      >
                        <Icon className="h-4 w-4 text-zinc-500" />
                        <span className="text-sm font-bold text-zinc-100">{interest.label}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-sm border border-zinc-800 bg-zinc-900/40 p-5 text-sm leading-6 text-zinc-500">
                  No preferences selected yet.
                </div>
              )}

              <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
                <div className="flex items-center gap-2 text-zinc-500">
                  <Clock className="h-3.5 w-3.5" />
                  <span className="text-xs font-bold">Capacity</span>
                </div>
                <p className="mt-3 flex items-end gap-1 text-3xl font-bold tracking-tight text-white">
                  {timeLabel(timeCommitment)}
                  {activeCapacitySegment >= 0 && <span className="pb-1 text-sm font-bold text-zinc-400">hrs / week</span>}
                </p>
                <div className="mt-5 grid grid-cols-3 gap-1.5">
                  {[0, 1, 2].map((segment) => (
                    <span
                      key={segment}
                      className={`h-1 rounded-full ${
                        activeCapacitySegment === segment ? "bg-emerald-500" : "bg-zinc-700"
                      }`}
                    />
                  ))}
                </div>
                <div className="mt-2 grid grid-cols-3 text-[11px] font-bold text-zinc-500">
                  <span>&lt;5</span>
                  <span className="text-center">5-10</span>
                  <span className="text-right">10+</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
