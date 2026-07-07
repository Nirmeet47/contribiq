"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { normalizeSkillName, skillIdentity } from "@/lib/skills";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Code2,
  FolderGit2,
  GitPullRequest,
  Loader2,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type SkillLevel = "strong" | "moderate" | "learning";

type Skill = {
  name: string;
  level: SkillLevel;
  confidence: number;
  repoCount: number;
  commitCount: number;
};

type SkillsResponse = {
  skills: Skill[];
  summary?: {
    totalCommits: number;
    totalRepos: number;
    mergedPRs: number;
  };
};

type SaveResponse = {
  success: boolean;
  skills?: Skill[];
  embeddingUpdated?: boolean;
  matchScoringTriggered?: boolean;
  error?: unknown;
};

const LEVELS: SkillLevel[] = ["strong", "moderate", "learning"];

const LEVEL_META: Record<
  SkillLevel,
  {
    label: string;
    description: string;
    border: string;
    bg: string;
    text: string;
    dot: string;
  }
> = {
  strong: {
    label: "Strong",
    description: "Skills the matcher should trust most.",
    border: "border-emerald-500/30",
    bg: "bg-emerald-500/10",
    text: "text-emerald-300",
    dot: "bg-emerald-400",
  },
  moderate: {
    label: "Moderate",
    description: "Skills you can contribute with, but less deeply.",
    border: "border-amber-500/30",
    bg: "bg-amber-500/10",
    text: "text-amber-300",
    dot: "bg-amber-400",
  },
  learning: {
    label: "Learning",
    description: "Skills you want beginner-friendly issues for.",
    border: "border-sky-500/30",
    bg: "bg-sky-500/10",
    text: "text-sky-300",
    dot: "bg-sky-400",
  },
};

function nextLevel(level: SkillLevel, direction: "up" | "down") {
  const index = LEVELS.indexOf(level);
  const nextIndex = direction === "up" ? index - 1 : index + 1;
  return LEVELS[nextIndex];
}

async function readJson<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(`Expected JSON, got ${contentType || "unknown content type"}`);
  }

  return (await response.json()) as T;
}

async function fetchSkills() {
  const response = await fetch("/api/me/skills");
  if (response.status === 401) {
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  if (!response.ok) {
    const body = await readJson<{ error?: unknown }>(response).catch(() => null);
    throw new Error(typeof body?.error === "string" ? body.error : `Failed to load skills: ${response.status}`);
  }

  return readJson<SkillsResponse>(response);
}

async function saveSkills(skills: Skill[]) {
  const response = await fetch("/api/me/skills", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      skills: skills.map((skill) => ({
        name: skill.name,
        level: skill.level,
      })),
    }),
  });

  if (response.status === 401) {
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  const payload = await readJson<SaveResponse>(response);
  if (!response.ok || !payload.success) {
    throw new Error(typeof payload.error === "string" ? payload.error : "Failed to save skills");
  }

  return payload;
}

export default function SkillsPage() {
  const queryClient = useQueryClient();
  const [draftSkills, setDraftSkills] = useState<Skill[]>([]);
  const [draftInitialized, setDraftInitialized] = useState(false);
  const [newSkillInputs, setNewSkillInputs] = useState<Record<SkillLevel, string>>({
    strong: "",
    moderate: "",
    learning: "",
  });
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const skillsQuery = useQuery({
    queryKey: ["me-skills"],
    queryFn: fetchSkills,
  });

  const serverSkills = useMemo(() => skillsQuery.data?.skills ?? [], [skillsQuery.data?.skills]);
  const skills = draftSkills;
  const summary = skillsQuery.data?.summary ?? { totalCommits: 0, totalRepos: 0, mergedPRs: 0 };
  const hasUnsavedChanges =
    JSON.stringify(skills.map(({ name, level }) => ({ name, level }))) !==
    JSON.stringify(serverSkills.map(({ name, level }) => ({ name, level })));

  useEffect(() => {
    if (skillsQuery.data && !draftInitialized) {
      void Promise.resolve().then(() => {
        setDraftSkills(skillsQuery.data.skills);
        setDraftInitialized(true);
      });
    }
  }, [draftInitialized, skillsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () => saveSkills(skills),
    onSuccess: async (payload) => {
      if (payload.skills) setDraftSkills(payload.skills);
      setDraftInitialized(true);
      setSaveMessage(
        payload.embeddingUpdated === false || payload.matchScoringTriggered === false
          ? "Skills saved. Match refresh will catch up after background services are available."
          : "Skills saved and match refresh started."
      );
      await queryClient.invalidateQueries({ queryKey: ["me-skills"] });
      await queryClient.invalidateQueries({ queryKey: ["feed"] });
      await queryClient.invalidateQueries({ queryKey: ["trending-repos"] });
    },
  });

  function setSkills(nextSkills: Skill[]) {
    setSaveMessage(null);
    setDraftSkills(nextSkills);
  }

  function addSkill(level: SkillLevel) {
    const name = normalizeSkillName(newSkillInputs[level]);
    if (!name) return;
    if (skills.some((skill) => skillIdentity(skill.name) === skillIdentity(name))) {
      setNewSkillInputs((current) => ({ ...current, [level]: "" }));
      return;
    }

    setSkills([
      ...skills,
      {
        name,
        level,
        confidence: 0.5,
        repoCount: 0,
        commitCount: 0,
      },
    ]);
    setNewSkillInputs((current) => ({ ...current, [level]: "" }));
  }

  function updateSkillLevel(name: string, level: SkillLevel) {
    setSkills(skills.map((skill) => (skill.name === name ? { ...skill, level } : skill)));
  }

  function removeSkill(name: string) {
    setSkills(skills.filter((skill) => skill.name !== name));
  }

  function resetDraft() {
    setDraftSkills(serverSkills);
    setSaveMessage(null);
  }

  function groupedSkills(level: SkillLevel) {
    return skills.filter((skill) => skill.level === level).sort((a, b) => a.name.localeCompare(b.name));
  }

  return (
    <section className="mx-auto max-w-6xl space-y-6 px-6 py-8 sm:px-8">
        <header className="flex flex-col gap-5 border-b border-zinc-900 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-400">Profile signals</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-100">Skills</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
              These skills are stored on your profile and used to refresh issue matches.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={resetDraft}
              disabled={!hasUnsavedChanges || saveMutation.isPending}
              className="rounded-sm border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-bold text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={!hasUnsavedChanges || saveMutation.isPending}
              className="inline-flex items-center gap-2 rounded-sm bg-emerald-500 px-4 py-2 text-sm font-bold text-zinc-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
            >
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Skills
            </button>
          </div>
        </header>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-4">
            <Code2 className="mb-3 h-4 w-4 text-zinc-500" />
            <p className="text-xl font-bold text-zinc-100">{summary.totalCommits.toLocaleString()}</p>
            <p className="text-xs font-medium text-zinc-500">Profile commits</p>
          </div>
          <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-4">
            <FolderGit2 className="mb-3 h-4 w-4 text-zinc-500" />
            <p className="text-xl font-bold text-zinc-100">{summary.totalRepos.toLocaleString()}</p>
            <p className="text-xs font-medium text-zinc-500">Profile repos</p>
          </div>
          <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-4">
            <GitPullRequest className="mb-3 h-4 w-4 text-zinc-500" />
            <p className="text-xl font-bold text-zinc-100">{summary.mergedPRs.toLocaleString()}</p>
            <p className="text-xs font-medium text-zinc-500">Merged PRs</p>
          </div>
        </div>

        {skillsQuery.isLoading && (
          <div className="flex min-h-64 items-center justify-center rounded-sm border border-zinc-800 bg-zinc-950">
            <div className="flex items-center gap-3 text-sm font-medium text-zinc-500">
              <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
              Loading skills...
            </div>
          </div>
        )}

        {skillsQuery.isError && (
          <div className="rounded-sm border border-red-500/30 bg-red-500/10 p-4 text-sm font-medium text-red-300">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Skills could not be loaded.
            </div>
          </div>
        )}

        {saveMutation.isError && (
          <div className="rounded-sm border border-red-500/30 bg-red-500/10 p-4 text-sm font-medium text-red-300">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Skills could not be saved.
            </div>
          </div>
        )}

        {saveMessage && (
          <div className="rounded-sm border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm font-medium text-emerald-300">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              {saveMessage}
            </div>
          </div>
        )}

        {!skillsQuery.isLoading && !skillsQuery.isError && (
          <div className="grid gap-4 xl:grid-cols-3">
            {LEVELS.map((level) => {
              const meta = LEVEL_META[level];
              const levelSkills = groupedSkills(level);

              return (
                <section key={level} className={`rounded-sm border bg-zinc-950 p-5 ${meta.border}`}>
                  <div className="mb-5 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-sm ${meta.dot}`} />
                      <h2 className={`text-sm font-bold uppercase tracking-wider ${meta.text}`}>{meta.label}</h2>
                      <span className="text-xs font-medium text-zinc-600">{levelSkills.length}</span>
                    </div>
                    <p className="text-xs leading-5 text-zinc-500">{meta.description}</p>
                  </div>

                  <div className="space-y-2">
                    {levelSkills.map((skill) => {
                      const upLevel = nextLevel(skill.level, "up");
                      const downLevel = nextLevel(skill.level, "down");

                      return (
                        <div key={skill.name} className={`rounded-sm border p-3 ${meta.border} ${meta.bg}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className={`truncate text-sm font-bold ${meta.text}`}>{skill.name}</p>
                              <p className="mt-1 text-[11px] font-medium text-zinc-500">
                                {Math.round(skill.confidence * 100)}% confidence
                              </p>
                            </div>

                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                onClick={() => upLevel && updateSkillLevel(skill.name, upLevel)}
                                disabled={!upLevel}
                                className="rounded-sm border border-zinc-800 bg-zinc-900 p-1.5 text-zinc-400 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                                aria-label={`Move ${skill.name} up`}
                                title="Move up"
                              >
                                <ArrowUp className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => downLevel && updateSkillLevel(skill.name, downLevel)}
                                disabled={!downLevel}
                                className="rounded-sm border border-zinc-800 bg-zinc-900 p-1.5 text-zinc-400 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                                aria-label={`Move ${skill.name} down`}
                                title="Move down"
                              >
                                <ArrowDown className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => removeSkill(skill.name)}
                                className="rounded-sm border border-zinc-800 bg-zinc-900 p-1.5 text-zinc-400 transition-colors hover:border-red-500/40 hover:text-red-300"
                                aria-label={`Remove ${skill.name}`}
                                title="Remove"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {levelSkills.length === 0 && (
                      <div className="rounded-sm border border-dashed border-zinc-800 bg-zinc-900/30 p-4 text-sm font-medium text-zinc-600">
                        No skills here yet.
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex gap-2">
                    <input
                      value={newSkillInputs[level]}
                      onChange={(event) =>
                        setNewSkillInputs((current) => ({ ...current, [level]: event.target.value }))
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") addSkill(level);
                      }}
                      placeholder="Add skill..."
                      className="h-10 min-w-0 flex-1 rounded-sm border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-emerald-500/50"
                    />
                    <button
                      type="button"
                      onClick={() => addSkill(level)}
                      className="inline-flex h-10 items-center justify-center rounded-sm border border-zinc-800 bg-zinc-900 px-3 text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white"
                      aria-label={`Add ${LEVEL_META[level].label} skill`}
                      title="Add skill"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </section>
              );
            })}
          </div>
        )}
    </section>
  );
}
