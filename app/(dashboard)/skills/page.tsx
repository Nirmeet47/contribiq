"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type { RefObject } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  GITHUB_LANGUAGE_GROUPS,
  normalizeSkillName,
  SKILL_LEVEL_ORDER,
  skillIdentity,
} from "@/lib/skills";

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

const LEVELS: SkillLevel[] = ["learning", "moderate", "strong"];

const LEVEL_LABELS: Record<SkillLevel, string> = {
  learning: "Learning",
  moderate: "Moderate",
  strong: "Strong",
};

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

function formatEvidence(skill: Skill) {
  const repos = `${skill.repoCount} ${skill.repoCount === 1 ? "repo" : "repos"}`;
  const commits = `${skill.commitCount} ${skill.commitCount === 1 ? "commit" : "commits"}`;
  return `${repos} / ${commits}`;
}

function confidencePercent(skill: Skill) {
  return Math.round(Math.max(0, Math.min(1, skill.confidence)) * 100);
}

function useDismissibleDetails(id: string, detailsRef: RefObject<HTMLDetailsElement | null>) {
  useEffect(() => {
    function closeOtherDropdowns(event: Event) {
      const current = event as CustomEvent<string>;
      if (current.detail !== id) detailsRef.current?.removeAttribute("open");
    }

    function closeOnOutsidePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (detailsRef.current?.contains(target)) return;

      detailsRef.current?.removeAttribute("open");
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;

      detailsRef.current?.removeAttribute("open");
      detailsRef.current?.querySelector("summary")?.blur();
    }

    window.addEventListener("dashboard-filter-open", closeOtherDropdowns);
    document.addEventListener("pointerdown", closeOnOutsidePointerDown, true);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("dashboard-filter-open", closeOtherDropdowns);
      document.removeEventListener("pointerdown", closeOnOutsidePointerDown, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [detailsRef, id]);
}

function LanguageSelect({
  value,
  disabledSkillIds,
  onChange,
}: {
  value: string;
  disabledSkillIds: Set<string>;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [search, setSearch] = useState("");
  const filteredGroups = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return GITHUB_LANGUAGE_GROUPS;

    return GITHUB_LANGUAGE_GROUPS.map((group) => ({
      label: group.label,
      languages: group.languages.filter((language) => language.toLowerCase().includes(query)),
    })).filter((group) => group.languages.length > 0);
  }, [search]);

  useDismissibleDetails(id, detailsRef);

  function selectLanguage(language: string) {
    onChange(language);
    detailsRef.current?.removeAttribute("open");
  }

  return (
    <details
      ref={detailsRef}
      className="group relative flex-1"
      onToggle={(event) => {
        if (event.currentTarget.open) {
          window.dispatchEvent(new CustomEvent("dashboard-filter-open", { detail: id }));
        }
      }}
    >
      <summary className="flex h-12 w-full cursor-pointer list-none items-center justify-between gap-3 rounded-sm border border-zinc-800 bg-zinc-900 px-4 text-sm font-semibold text-white outline-none transition-colors hover:border-zinc-700 [&::-webkit-details-marker]:hidden">
        <span className="truncate">{value || "Select language"}</span>
        <ChevronDown className="h-4 w-4 text-zinc-500 transition-transform group-open:rotate-180" />
      </summary>

      <div className="absolute left-0 z-30 mt-2 w-full rounded-sm border border-zinc-800 bg-zinc-950 p-2 shadow-xl shadow-black/40">
        <label className="relative mb-2 block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search language"
            className="h-10 w-full rounded-sm border border-zinc-800 bg-zinc-900 pl-8 pr-9 text-sm font-normal text-white outline-none transition-colors placeholder:text-zinc-500 hover:border-zinc-700 focus:border-emerald-500/60"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-1 top-1 inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-sm text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </label>

        <div className="custom-scrollbar max-h-72 overflow-y-auto">
          {filteredGroups.length === 0 ? (
            <p className="px-2.5 py-2 text-sm font-medium text-zinc-500">No languages found.</p>
          ) : (
            filteredGroups.map((group) => (
              <div key={group.label} className="py-1 first:pt-0 last:pb-0">
                <p className="mb-1 flex min-h-10 items-center rounded-sm border border-zinc-800 bg-zinc-900 px-2.5 text-lg font-semibold text-white">
                  {group.label}
                </p>
                {group.languages.map((language) => {
                  const selected = value !== "" && language === value;
                  const disabled = disabledSkillIds.has(skillIdentity(language));

                  return (
                    <button
                      key={language}
                      type="button"
                      onClick={() => selectLanguage(language)}
                      disabled={disabled}
                      className={`flex w-full cursor-pointer items-center gap-2 rounded-sm px-2.5 py-2.5 text-left text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                        selected
                          ? "bg-emerald-500/10 text-emerald-300"
                          : "text-zinc-200 hover:bg-zinc-900 hover:text-white"
                      }`}
                    >
                      <span
                        className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border ${
                          selected
                            ? "border-emerald-400 bg-emerald-500 text-zinc-950"
                            : "border-zinc-700 bg-zinc-950 text-transparent"
                        }`}
                        aria-hidden="true"
                      >
                        <Check className="h-3 w-3" strokeWidth={3.5} />
                      </span>
                      <span className="truncate">{language}</span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </details>
  );
}

export default function SkillsPage() {
  const queryClient = useQueryClient();
  const [draftSkills, setDraftSkills] = useState<Skill[]>([]);
  const [draftInitialized, setDraftInitialized] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState("");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const skillsQuery = useQuery({
    queryKey: ["me-skills"],
    queryFn: fetchSkills,
  });

  const selectedSkillIds = useMemo(
    () => new Set(draftSkills.map((skill) => skillIdentity(skill.name))),
    [draftSkills]
  );

  const sortedSkills = useMemo(
    () =>
      [...draftSkills].sort((a, b) => {
        const levelDelta = SKILL_LEVEL_ORDER[a.level] - SKILL_LEVEL_ORDER[b.level];
        if (levelDelta !== 0) return levelDelta;
        return b.confidence - a.confidence || a.name.localeCompare(b.name);
      }),
    [draftSkills]
  );

  useEffect(() => {
    if (skillsQuery.data && !draftInitialized) {
      void Promise.resolve().then(() => {
        setDraftSkills(skillsQuery.data.skills);
        setDraftInitialized(true);
      });
    }
  }, [draftInitialized, skillsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (nextSkills: Skill[]) => saveSkills(nextSkills),
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
    saveMutation.mutate(nextSkills);
  }

  function addSelectedLanguage() {
    const name = normalizeSkillName(selectedLanguage);
    if (!name || draftSkills.some((skill) => skillIdentity(skill.name) === skillIdentity(name))) return;

    setSkills([
      ...draftSkills,
      {
        name,
        level: "learning",
        confidence: 0.5,
        repoCount: 0,
        commitCount: 0,
      },
    ]);
    setSelectedLanguage("");
  }

  function updateSkillLevel(name: string, level: SkillLevel) {
    setSkills(draftSkills.map((skill) => (skill.name === name ? { ...skill, level } : skill)));
  }

  function removeSkill(name: string) {
    setSkills(draftSkills.filter((skill) => skill.name !== name));
  }

  return (
    <section className="mx-auto w-full max-w-7xl space-y-6 px-6 py-8 sm:px-8 lg:px-12">
      <header>
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-zinc-100">Skills</h1>
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-zinc-400">
            Ranked by trust. Change the tier to control how strongly the matcher weighs each language.
          </p>
        </div>
      </header>

      <div className="space-y-6">
          <div className="flex flex-col gap-3 pt-3 lg:flex-row">
            <LanguageSelect
              value={selectedLanguage}
              disabledSkillIds={selectedSkillIds}
              onChange={setSelectedLanguage}
            />
            <Button
              type="button"
              onClick={addSelectedLanguage}
              disabled={!selectedLanguage || selectedSkillIds.has(skillIdentity(selectedLanguage))}
              className="h-12 cursor-pointer px-5 disabled:cursor-not-allowed lg:w-fit"
            >
              <Plus className="h-4 w-4" />
              Add skill
            </Button>
          </div>

          {skillsQuery.isLoading && (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((item) => (
                <Skeleton key={item} className="h-16 w-full" />
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
            <div className="overflow-hidden rounded-sm border border-zinc-800 bg-zinc-950">
              <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_40px] gap-8 border-b border-zinc-800 px-4 py-3 text-sm font-bold text-zinc-100 lg:grid">
                <span>Skill</span>
                <span className="text-center">Confidence</span>
                <span className="text-center">Trust tier</span>
                <span />
              </div>

              {sortedSkills.length === 0 ? (
                <div className="p-8 text-center text-sm font-medium text-zinc-500">
                  Add your first language to start shaping recommendations.
                </div>
              ) : (
                <div className="divide-y divide-zinc-800">
                  {sortedSkills.map((skill) => {
                    const confidence = confidencePercent(skill);

                    return (
                      <div
                        key={skill.name}
                        className="grid gap-4 bg-zinc-950 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_40px] lg:items-center lg:gap-8"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-base font-bold text-zinc-100">{skill.name}</p>
                          <p className="mt-1 text-xs font-medium text-zinc-500">{formatEvidence(skill)}</p>
                        </div>

                        <div className="flex w-full items-center gap-2">
                          <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-sm bg-zinc-900">
                            <div
                              className="h-full rounded-sm bg-emerald-500"
                              style={{ width: `${confidence}%` }}
                            />
                          </div>
                          <span className="w-9 shrink-0 text-right text-xs font-bold leading-none text-zinc-300">
                            {confidence}%
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-1 rounded-sm border border-zinc-800 bg-zinc-900 p-1">
                          {LEVELS.map((level) => {
                            const active = skill.level === level;

                            return (
                              <button
                                key={level}
                                type="button"
                                onClick={() => updateSkillLevel(skill.name, level)}
                                className={`flex h-10 cursor-pointer items-center justify-center gap-1 rounded-sm px-2 text-xs font-bold transition-colors ${
                                  active
                                    ? "bg-zinc-800 text-white shadow-sm"
                                    : "text-zinc-300 hover:bg-zinc-950/70 hover:text-white"
                                }`}
                              >
                                {active && level === "strong" && <Check className="h-3.5 w-3.5 text-emerald-300" />}
                                {LEVEL_LABELS[level]}
                              </button>
                            );
                          })}
                        </div>

                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          onClick={() => removeSkill(skill.name)}
                          aria-label={`Remove ${skill.name}`}
                          title="Remove"
                          className="h-9 w-9 cursor-pointer place-self-center"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
    </section>
  );
}
