import type { Dispatch, SetStateAction } from "react";
import { useRef, useState } from "react";
import {
  ArrowRight,
  Code2,
  FolderGit2,
  GitPullRequest,
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  Save,
  X,
} from "lucide-react";
import { normalizeSkillName, skillIdentity } from "@/lib/skills";

const LEVEL_CONFIG = {
  strong: {
    label: "Strong",
    border: "border-emerald-500/30",
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
    dot: "bg-emerald-500",
    hoverBorder: "hover:border-emerald-500/60",
    dropBg: "bg-emerald-500/5",
  },
  moderate: {
    label: "Moderate",
    border: "border-amber-500/30",
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    dot: "bg-amber-500",
    hoverBorder: "hover:border-amber-500/60",
    dropBg: "bg-amber-500/5",
  },
  learning: {
    label: "Learning",
    border: "border-sky-500/30",
    bg: "bg-sky-500/10",
    text: "text-sky-400",
    dot: "bg-sky-500",
    hoverBorder: "hover:border-sky-500/60",
    dropBg: "bg-sky-500/5",
  },
} as const;

type SkillLevel = keyof typeof LEVEL_CONFIG;

type Skill = {
  name: string;
  level: SkillLevel;
  confidence: number;
  repoCount: number;
  commitCount: number;
};

export function DashboardSkillReview({
  skills,
  setSkills,
  summary,
  saving,
  onSave,
  onContinue,
}: {
  skills: Skill[];
  setSkills: Dispatch<SetStateAction<Skill[]>>;
  summary: { totalCommits: number; totalRepos: number; mergedPRs: number };
  saving: boolean;
  onSave: () => Promise<void>;
  onContinue: () => void;
}) {
  const [editMode, setEditMode] = useState(false);
  const [dragOverLevel, setDragOverLevel] = useState<SkillLevel | null>(null);
  const [newSkillInputs, setNewSkillInputs] = useState<Record<SkillLevel, string>>({
    strong: "",
    moderate: "",
    learning: "",
  });
  const dragItem = useRef<{ name: string; fromLevel: SkillLevel } | null>(null);

  function handleDrop(targetLevel: SkillLevel) {
    if (!dragItem.current) return;
    const { name, fromLevel } = dragItem.current;
    if (fromLevel !== targetLevel) {
      setSkills((current) => current.map((skill) => (skill.name === name ? { ...skill, level: targetLevel } : skill)));
    }
    dragItem.current = null;
    setDragOverLevel(null);
  }

  function handleAddSkill(level: SkillLevel) {
    const name = normalizeSkillName(newSkillInputs[level]);
    if (!name || skills.some((skill) => skillIdentity(skill.name) === skillIdentity(name))) return;
    setSkills((current) => [...current, { name, level, confidence: 0.5, repoCount: 0, commitCount: 0 }]);
    setNewSkillInputs((current) => ({ ...current, [level]: "" }));
  }

  async function handleSave() {
    if (editMode) {
      await onSave();
      setEditMode(false);
    } else {
      setEditMode(true);
    }
  }

  const grouped: Record<SkillLevel, Skill[]> = { strong: [], moderate: [], learning: [] };
  for (const skill of skills) grouped[skill.level]?.push(skill);

  return (
    <main className="fixed inset-0 z-50 min-h-screen overflow-y-auto bg-zinc-950 text-zinc-50 font-sans selection:bg-emerald-500/30">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
      <div className="relative z-10 mx-auto max-w-3xl px-6 py-16 space-y-10">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-bold uppercase tracking-widest text-emerald-500">Step 2 of 4</p>
              <h1 className="text-3xl font-bold tracking-tight">Your Skill Profile</h1>
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className={`flex items-center gap-2 rounded-sm border px-4 py-2 text-sm font-bold transition-colors ${
                editMode
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                  : "border-zinc-800 bg-zinc-900/50 text-zinc-300 hover:bg-zinc-800 hover:text-white"
              }`}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editMode ? <Save className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
              {editMode ? "Save Changes" : "Edit Skills"}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm font-medium text-zinc-400">
            <span className="flex items-center gap-1.5">
              <Code2 className="h-4 w-4 text-zinc-500" />
              {summary.totalCommits.toLocaleString()} commits
            </span>
            <span className="flex items-center gap-1.5">
              <FolderGit2 className="h-4 w-4 text-zinc-500" />
              {summary.totalRepos} repos
            </span>
            {summary.mergedPRs > 0 && (
              <span className="flex items-center gap-1.5">
                <GitPullRequest className="h-4 w-4 text-zinc-500" />
                {summary.mergedPRs} merged PRs
              </span>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {(Object.keys(LEVEL_CONFIG) as SkillLevel[]).map((level) => {
            const config = LEVEL_CONFIG[level];
            const levelSkills = grouped[level] || [];
            const isDragTarget = dragOverLevel === level;

            return (
              <div
                key={level}
                className={`rounded-sm border p-5 transition-all ${
                  isDragTarget ? `${config.border} ${config.dropBg}` : "border-zinc-800 bg-zinc-950"
                }`}
                onDragOver={(event) => {
                  if (editMode) {
                    event.preventDefault();
                    setDragOverLevel(level);
                  }
                }}
                onDragLeave={() => setDragOverLevel(null)}
                onDrop={() => {
                  if (editMode) handleDrop(level);
                }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <span className={`h-2 w-2 rounded-sm ${config.dot}`} />
                  <h2 className={`text-sm font-bold uppercase tracking-wider ${config.text}`}>{config.label}</h2>
                  <span className="text-xs font-medium text-zinc-600">
                    {levelSkills.length} skill{levelSkills.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {levelSkills.map((skill) => (
                    <div
                      key={skill.name}
                      draggable={editMode}
                      onDragStart={() => {
                        dragItem.current = { name: skill.name, fromLevel: level };
                      }}
                      className={`group flex items-center gap-2 rounded-sm border px-3 py-1.5 text-sm font-medium transition-all ${config.border} ${config.bg} ${config.text} ${editMode ? `cursor-grab active:cursor-grabbing ${config.hoverBorder}` : ""}`}
                    >
                      {editMode && <GripVertical className="h-3 w-3 opacity-50" />}
                      {skill.name}
                      {!editMode && <span className="text-[10px] opacity-60">{config.label}</span>}
                      {editMode && (
                        <button
                          type="button"
                          onClick={() => setSkills((current) => current.filter((item) => item.name !== skill.name))}
                          className="ml-1 opacity-50 transition-opacity hover:opacity-100"
                          aria-label={`Remove ${skill.name}`}
                          title={`Remove ${skill.name}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ))}
                  {levelSkills.length === 0 && (
                    <span className="text-xs text-zinc-600 font-medium py-1.5">
                      {editMode ? "Drag skills here or add below" : "No skills in this group"}
                    </span>
                  )}
                </div>
                {editMode && (
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="text"
                      value={newSkillInputs[level]}
                      onChange={(event) => setNewSkillInputs((current) => ({ ...current, [level]: event.target.value }))}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") handleAddSkill(level);
                      }}
                      placeholder="Add a skill..."
                      className="flex-1 rounded-sm border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 placeholder:text-zinc-600 focus:border-zinc-700 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddSkill(level)}
                      className={`flex items-center gap-1 rounded-sm border px-3 py-1.5 text-xs font-bold transition-colors ${config.border} ${config.text} hover:${config.bg}`}
                    >
                      <Plus className="h-3 w-3" /> Add
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex justify-end">
          <button
            onClick={onContinue}
            className="flex items-center gap-2 rounded-sm bg-emerald-500 px-6 py-3 text-sm font-bold text-zinc-950 transition-colors hover:bg-emerald-400"
          >
            Looks good <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </main>
  );
}
