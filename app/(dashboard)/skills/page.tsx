"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Loader2,
  Plus,
  Save,
  Trash2,
  Undo2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { normalizeSkillName, skillIdentity } from "@/lib/skills";

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
    badge: "success" | "secondary" | "outline";
    accent: string;
    panel: string;
  }
> = {
  strong: {
    label: "Strong",
    description: "Skills the matcher should trust most for recommendations.",
    badge: "success",
    accent: "text-emerald-300",
    panel: "border-emerald-500/30 bg-emerald-500/5",
  },
  moderate: {
    label: "Moderate",
    description: "Skills you can contribute with, but less deeply.",
    badge: "secondary",
    accent: "text-amber-300",
    panel: "border-amber-500/25 bg-amber-500/5",
  },
  learning: {
    label: "Learning",
    description: "Skills you want beginner-friendly issues for.",
    badge: "outline",
    accent: "text-sky-300",
    panel: "border-sky-500/25 bg-sky-500/5",
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
  const response = await fetch("/api/skills");
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
  const response = await fetch("/api/skills", {
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

function skillSnapshot(skills: Skill[]) {
  return JSON.stringify(
    skills
      .map(({ name, level }) => ({ name: skillIdentity(name), level }))
      .sort((a, b) => a.name.localeCompare(b.name))
  );
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
  const hasUnsavedChanges = skillSnapshot(draftSkills) !== skillSnapshot(serverSkills);

  const groupedSkills = useMemo(() => {
    const grouped: Record<SkillLevel, Skill[]> = { strong: [], moderate: [], learning: [] };
    for (const skill of draftSkills) grouped[skill.level]?.push(skill);
    for (const level of LEVELS) grouped[level].sort((a, b) => a.name.localeCompare(b.name));
    return grouped;
  }, [draftSkills]);

  useEffect(() => {
    if (skillsQuery.data && !draftInitialized) {
      void Promise.resolve().then(() => {
        setDraftSkills(skillsQuery.data.skills);
        setDraftInitialized(true);
      });
    }
  }, [draftInitialized, skillsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () => saveSkills(draftSkills),
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
      await queryClient.invalidateQueries({ queryKey: ["trending-projects"] });
    },
  });

  function setSkills(nextSkills: Skill[]) {
    setSaveMessage(null);
    setDraftSkills(nextSkills);
  }

  function addSkill(level: SkillLevel) {
    const name = normalizeSkillName(newSkillInputs[level]);
    if (!name) return;
    if (draftSkills.some((skill) => skillIdentity(skill.name) === skillIdentity(name))) {
      setNewSkillInputs((current) => ({ ...current, [level]: "" }));
      return;
    }

    setSkills([
      ...draftSkills,
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
    setSkills(draftSkills.map((skill) => (skill.name === name ? { ...skill, level } : skill)));
  }

  function removeSkill(name: string) {
    setSkills(draftSkills.filter((skill) => skill.name !== name));
  }

  function resetDraft() {
    setDraftSkills(serverSkills);
    setSaveMessage(null);
  }

  return (
    <section className="mx-auto w-full max-w-7xl space-y-6 px-6 py-8 sm:px-8 lg:px-12">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-400">Profile signals</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-100">Skills</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
            Review the skills ContribIQ uses to rank issues and decide where new skills should sit.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={resetDraft}
            disabled={!hasUnsavedChanges || saveMutation.isPending}
            className="cursor-pointer disabled:cursor-not-allowed"
          >
            <Undo2 className="h-4 w-4" />
            Reset
          </Button>
          <Button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={!hasUnsavedChanges || saveMutation.isPending}
            className="cursor-pointer disabled:cursor-not-allowed"
          >
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Skills
          </Button>
        </div>
      </header>

      <Separator />

      {skillsQuery.isLoading && (
        <div className="grid gap-4 xl:grid-cols-3">
          {LEVELS.map((level) => (
            <Card key={level}>
              <CardHeader>
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-4 w-full" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {skillsQuery.isError && (
        <Alert variant="destructive">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Skills could not be loaded.</AlertDescription>
          </div>
        </Alert>
      )}

      {saveMutation.isError && (
        <Alert variant="destructive">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Skills could not be saved.</AlertDescription>
          </div>
        </Alert>
      )}

      {saveMessage && (
        <div className="flex items-center gap-2 text-sm font-medium text-emerald-300">
          <CheckCircle2 className="h-4 w-4" />
          <span>{saveMessage}</span>
        </div>
      )}

      {!skillsQuery.isLoading && !skillsQuery.isError && (
        <div className="grid gap-4 xl:grid-cols-3">
          {LEVELS.map((level) => {
            const meta = LEVEL_META[level];
            const levelSkills = groupedSkills[level];

            return (
              <Card key={level} className={meta.panel}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle className={meta.accent}>{meta.label}</CardTitle>
                      <CardDescription>{meta.description}</CardDescription>
                    </div>
                    <Badge variant={meta.badge}>{levelSkills.length}</Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  {levelSkills.map((skill) => {
                    const upLevel = nextLevel(skill.level, "up");
                    const downLevel = nextLevel(skill.level, "down");

                    return (
                      <div key={skill.name} className="rounded-sm border border-zinc-800 bg-zinc-950 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-zinc-100">{skill.name}</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <Badge variant="secondary">{Math.round(skill.confidence * 100)}% confidence</Badge>
                              {(skill.repoCount > 0 || skill.commitCount > 0) && (
                                <Badge variant="outline">
                                  {skill.repoCount} repos / {skill.commitCount} commits
                                </Badge>
                              )}
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => upLevel && updateSkillLevel(skill.name, upLevel)}
                              disabled={!upLevel}
                              aria-label={`Move ${skill.name} up`}
                              title="Move up"
                              className="h-8 w-8 cursor-pointer disabled:cursor-not-allowed"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => downLevel && updateSkillLevel(skill.name, downLevel)}
                              disabled={!downLevel}
                              aria-label={`Move ${skill.name} down`}
                              title="Move down"
                              className="h-8 w-8 cursor-pointer disabled:cursor-not-allowed"
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              onClick={() => removeSkill(skill.name)}
                              aria-label={`Remove ${skill.name}`}
                              title="Remove"
                              className="h-8 w-8 cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {levelSkills.length === 0 && (
                    <div className="rounded-sm border border-dashed border-zinc-800 bg-zinc-950/70 p-4 text-sm font-medium text-zinc-500">
                      No skills in this group yet.
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    <Input
                      value={newSkillInputs[level]}
                      onChange={(event) =>
                        setNewSkillInputs((current) => ({ ...current, [level]: event.target.value }))
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") addSkill(level);
                      }}
                      placeholder={`Add ${meta.label.toLowerCase()} skill`}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => addSkill(level)}
                      aria-label={`Add ${meta.label} skill`}
                      title="Add skill"
                      className="shrink-0 cursor-pointer"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
