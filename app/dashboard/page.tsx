"use client"

import { useEffect, useState, useRef } from "react"
import { createClient } from "@/utils/supabase/client"
import {
  LogOut, Code2, GitPullRequest, Star, User, BookOpen,
  CheckCircle2, Loader2, XCircle, GitMerge, Brain, Fingerprint,
  ArrowRight, GripVertical, Pencil, Plus, Save, X, FolderGit2
} from "lucide-react"

// -- Types --
interface Skill {
  name: string
  level: "strong" | "moderate" | "learning"
  confidence: number
  repoCount: number
  commitCount: number
}

type ViewState = "loading" | "onboarding" | "skills_review" | "dashboard"

// -- Configs --
const STEP_META: Record<string, { icon: React.ReactNode; label: string }> = {
  fetching: { icon: <GitMerge className="h-5 w-5" />, label: "Fetching GitHub Data" },
  analysing: { icon: <Brain className="h-5 w-5" />, label: "AI Analysis" },
  writing: { icon: <Code2 className="h-5 w-5" />, label: "Saving Profile" },
  embedding: { icon: <Fingerprint className="h-5 w-5" />, label: "Building Fingerprint" },
  done: { icon: <CheckCircle2 className="h-5 w-5" />, label: "Complete" },
  error: { icon: <XCircle className="h-5 w-5" />, label: "Error" },
}
const STEP_ORDER = ["fetching", "analysing", "writing", "embedding", "done"]

const LEVEL_CONFIG = {
  strong: {
    label: "Strong", border: "border-emerald-500/30", bg: "bg-emerald-500/10",
    text: "text-emerald-400", dot: "bg-emerald-500", hoverBorder: "hover:border-emerald-500/60",
    dropBg: "bg-emerald-500/5",
  },
  moderate: {
    label: "Moderate", border: "border-amber-500/30", bg: "bg-amber-500/10",
    text: "text-amber-400", dot: "bg-amber-500", hoverBorder: "hover:border-amber-500/60",
    dropBg: "bg-amber-500/5",
  },
  learning: {
    label: "Learning", border: "border-sky-500/30", bg: "bg-sky-500/10",
    text: "text-sky-400", dot: "bg-sky-500", hoverBorder: "hover:border-sky-500/60",
    dropBg: "bg-sky-500/5",
  },
} as const
type Level = keyof typeof LEVEL_CONFIG

export default function DashboardPage() {
  const supabase = createClient()

  // -- Global State --
  const [user, setUser] = useState<any>(null)
  const [dbUser, setDbUser] = useState<any>(null)
  const [viewState, setViewState] = useState<ViewState>("loading")

  // -- Onboarding State --
  const [currentStep, setCurrentStep] = useState("fetching")
  const [message, setMessage] = useState("Connecting to GitHub…")
  const [isDone, setIsDone] = useState(false)
  const [isError, setIsError] = useState(false)
  const sseStarted = useRef(false)

  // -- Skills State --
  const [skills, setSkills] = useState<Skill[]>([])
  const [summary, setSummary] = useState({ totalCommits: 0, totalRepos: 0, mergedPRs: 0 })
  const [editMode, setEditMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newSkillInputs, setNewSkillInputs] = useState<Record<Level, string>>({
    strong: "", moderate: "", learning: "",
  })
  const dragItem = useRef<{ name: string; fromLevel: Level } | null>(null)
  const [dragOverLevel, setDragOverLevel] = useState<Level | null>(null)

  // 1. Initial Load & Auth Check
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        window.location.href = "/login"
        return
      }
      setUser(user)

      try {
        const res = await fetch("/api/me")
        const data = await res.json()
        if (data && !data.error) {
          setDbUser(data)
          if (data.onboarded === false) {
            setViewState("onboarding")
          } else {
            // Already onboarded, fetch skills and show dashboard
            fetchSkills()
            setViewState("dashboard")
          }
        }
      } catch (err) {
        console.error("Failed to load DB user", err)
      }
    }
    init()
  }, [])

  // 2. Trigger SSE if in onboarding state
  useEffect(() => {
    if (viewState !== "onboarding" || sseStarted.current) return
    sseStarted.current = true

    const eventSource = new EventSource("/api/onboarding/progress")

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data)
      setCurrentStep(data.step)
      setMessage(data.message)

      if (data.step === "done") {
        setIsDone(true)
        eventSource.close()
        // Wait a moment then transition to skills review
        setTimeout(() => {
          fetchSkills()
          setViewState("skills_review")
        }, 2000)
      }

      if (data.step === "error") {
        setIsError(true)
        eventSource.close()
      }
    }

    eventSource.onerror = () => {
      setIsError(true)
      setMessage("Lost connection to the analysis server.")
      eventSource.close()
    }

    return () => eventSource.close()
  }, [viewState])

  // -- Helpers --
  const fetchSkills = async () => {
    try {
      const r = await fetch("/api/me/skills")
      const data = await r.json()
      if (data.skills) {
        setSkills(data.skills)
        setSummary(data.summary)
      }
    } catch (e) {
      console.error("Failed to fetch skills", e)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  const handleSaveSkills = async () => {
    setSaving(true)
    try {
      await fetch("/api/me/skills", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skills: skills.map((s) => ({ name: s.name, level: s.level })),
        }),
      })
      setEditMode(false)
    } catch (err) {
      console.error("Failed to save skills:", err)
    } finally {
      setSaving(false)
    }
  }

  const handleFinishOnboarding = () => {
    // If we're coming from the review screen, the backend already marked them onboarded during SSE
    // Just switch to dashboard view
    setViewState("dashboard")
  }

  // -- Drag Handlers --
  const handleDrop = (targetLevel: Level) => {
    if (!dragItem.current) return
    const { name, fromLevel } = dragItem.current
    if (fromLevel !== targetLevel) {
      setSkills((prev) => prev.map((s) => (s.name === name ? { ...s, level: targetLevel } : s)))
    }
    dragItem.current = null
    setDragOverLevel(null)
  }

  const handleAddSkill = (level: Level) => {
    const name = newSkillInputs[level].trim()
    if (!name || skills.some((s) => s.name.toLowerCase() === name.toLowerCase())) return
    setSkills((prev) => [...prev, { name, level, confidence: 0.5, repoCount: 0, commitCount: 0 }])
    setNewSkillInputs((prev) => ({ ...prev, [level]: "" }))
  }


  // ==========================================
  // RENDER: LOADING
  // ==========================================
  if (viewState === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
          <p className="text-sm font-medium text-zinc-400">Loading your profile...</p>
        </div>
      </main>
    )
  }

  // ==========================================
  // RENDER: ONBOARDING PROGRESS (SSE)
  // ==========================================
  if (viewState === "onboarding") {
    const currentIndex = STEP_ORDER.indexOf(currentStep)
    const progressPercent = isDone
      ? 100
      : isError
      ? Math.max((currentIndex / (STEP_ORDER.length - 1)) * 100, 10)
      : Math.max(((currentIndex + 0.5) / (STEP_ORDER.length - 1)) * 100, 5)

    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-6 text-zinc-50 font-sans">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
        <div className="relative z-10 w-full max-w-lg space-y-8">
          <div className="text-center space-y-2">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-sm bg-emerald-500 mb-4">
              {isDone ? <CheckCircle2 className="h-7 w-7 text-zinc-950" /> : isError ? <XCircle className="h-7 w-7 text-zinc-950" /> : <Loader2 className="h-7 w-7 text-zinc-950 animate-spin" />}
            </div>
            <h1 className="text-3xl font-bold tracking-tight">
              {isDone ? "You're All Set" : isError ? "Analysis Failed" : "Analyzing Your Profile"}
            </h1>
            <p className="text-sm text-zinc-400 font-medium">{message}</p>
          </div>
          <div className="relative h-1.5 w-full overflow-hidden rounded-sm bg-zinc-900 border border-zinc-800">
            <div className={`absolute left-0 top-0 h-full transition-all duration-700 ease-out rounded-sm ${isError ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="rounded-sm border border-zinc-800 bg-zinc-950 divide-y divide-zinc-800/50">
            {STEP_ORDER.slice(0, -1).map((step, i) => {
              const meta = STEP_META[step]
              const isActive = currentStep === step
              const isCompleted = currentIndex > i || isDone
              return (
                <div key={step} className={`flex items-center gap-4 px-5 py-4 transition-colors ${isActive ? "bg-zinc-900/50" : ""}`}>
                  <div className={`flex h-8 w-8 items-center justify-center rounded-sm border transition-all ${isCompleted ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : isActive ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-400" : "border-zinc-800 bg-zinc-900 text-zinc-600"}`}>
                    {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : isActive ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="text-xs font-bold">{i + 1}</span>}
                  </div>
                  <div className="flex-1"><p className={`text-sm font-semibold ${isCompleted || isActive ? "text-zinc-100" : "text-zinc-500"}`}>{meta.label}</p></div>
                  <div className={`transition-colors ${isCompleted ? "text-emerald-500" : isActive ? "text-zinc-300" : "text-zinc-700"}`}>{meta.icon}</div>
                </div>
              )
            })}
          </div>
          {isError && (
            <button onClick={() => window.location.reload()} className="w-full rounded-sm bg-white px-4 py-3 text-sm font-bold text-zinc-950 transition-colors hover:bg-zinc-200">
              Try Again
            </button>
          )}
        </div>
      </main>
    )
  }


  const renderSkillGroups = () => {
    const grouped: Record<Level, Skill[]> = { strong: [], moderate: [], learning: [] }
    for (const skill of skills) grouped[skill.level]?.push(skill)

    return (["strong", "moderate", "learning"] as Level[]).map((level) => {
      const config = LEVEL_CONFIG[level]
      const levelSkills = grouped[level] || []
      const isDragTarget = dragOverLevel === level

      return (
        <div
          key={level}
          className={`rounded-sm border p-5 transition-all ${isDragTarget ? `${config.border} ${config.dropBg}` : "border-zinc-800 bg-zinc-950"}`}
          onDragOver={(e) => { if (editMode) { e.preventDefault(); setDragOverLevel(level); } }}
          onDragLeave={() => setDragOverLevel(null)}
          onDrop={() => { if (editMode) handleDrop(level); }}
        >
          <div className="flex items-center gap-2 mb-4">
            <span className={`h-2 w-2 rounded-sm ${config.dot}`} />
            <h2 className={`text-sm font-bold uppercase tracking-wider ${config.text}`}>{config.label}</h2>
            <span className="text-xs font-medium text-zinc-600">{levelSkills.length} skill{levelSkills.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {levelSkills.map((skill) => (
              <div
                key={skill.name}
                draggable={editMode}
                onDragStart={() => { dragItem.current = { name: skill.name, fromLevel: level } }}
                className={`group flex items-center gap-2 rounded-sm border px-3 py-1.5 text-sm font-medium transition-all ${config.border} ${config.bg} ${config.text} ${editMode ? `cursor-grab active:cursor-grabbing ${config.hoverBorder}` : ""}`}
              >
                {editMode && <GripVertical className="h-3 w-3 opacity-50" />}
                {skill.name}
                {!editMode && <span className="text-[10px] opacity-60">{Math.round(skill.confidence * 100)}%</span>}
                {editMode && (
                  <button onClick={() => setSkills((p) => p.filter((s) => s.name !== skill.name))} className="ml-1 opacity-50 hover:opacity-100 transition-opacity">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
            {levelSkills.length === 0 && <span className="text-xs text-zinc-600 font-medium py-1.5">{editMode ? "Drag skills here or add below" : "No skills in this group"}</span>}
          </div>
          {editMode && (
            <div className="mt-3 flex items-center gap-2">
              <input
                type="text"
                value={newSkillInputs[level]}
                onChange={(e) => setNewSkillInputs((prev) => ({ ...prev, [level]: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && handleAddSkill(level)}
                placeholder="Add a skill…"
                className="flex-1 rounded-sm border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 placeholder:text-zinc-600 focus:border-zinc-700 focus:outline-none"
              />
              <button onClick={() => handleAddSkill(level)} className={`flex items-center gap-1 rounded-sm border px-3 py-1.5 text-xs font-bold transition-colors ${config.border} ${config.text} hover:${config.bg}`}>
                <Plus className="h-3 w-3" /> Add
              </button>
            </div>
          )}
        </div>
      )
    })
  }

  if (viewState === "skills_review") {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-50 font-sans selection:bg-emerald-500/30">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
        <div className="relative z-10 mx-auto max-w-3xl px-6 py-16 space-y-10">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs font-bold uppercase tracking-widest text-emerald-500">Step 2 of 3</p>
                <h1 className="text-3xl font-bold tracking-tight">Your Skill Profile</h1>
              </div>
              <button
                onClick={() => (editMode ? handleSaveSkills() : setEditMode(true))}
                disabled={saving}
                className={`flex items-center gap-2 rounded-sm border px-4 py-2 text-sm font-bold transition-colors ${editMode ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20" : "border-zinc-800 bg-zinc-900/50 text-zinc-300 hover:bg-zinc-800 hover:text-white"}`}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editMode ? <Save className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                {editMode ? "Save Changes" : "Edit Skills"}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm font-medium text-zinc-400">
              <span className="flex items-center gap-1.5"><Code2 className="h-4 w-4 text-zinc-500" />{summary.totalCommits.toLocaleString()} commits</span>
              <span className="flex items-center gap-1.5"><FolderGit2 className="h-4 w-4 text-zinc-500" />{summary.totalRepos} repos</span>
              {summary.mergedPRs > 0 && <span className="flex items-center gap-1.5"><GitPullRequest className="h-4 w-4 text-zinc-500" />{summary.mergedPRs} merged PRs</span>}
            </div>
          </div>
          <div className="space-y-6">
            {renderSkillGroups()}
          </div>
          <div className="flex justify-end">
            <button onClick={handleFinishOnboarding} className="flex items-center gap-2 rounded-sm bg-emerald-500 px-6 py-3 text-sm font-bold text-zinc-950 transition-colors hover:bg-emerald-400">
              Looks good <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </main>
    )
  }

  const avatarUrl = dbUser?.avatarUrl || user?.user_metadata?.avatar_url
  const name = dbUser?.name || user?.user_metadata?.full_name || "Developer"
  const username = dbUser?.username || user?.user_metadata?.preferred_username

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50 font-sans selection:bg-emerald-500/30">
      <nav className="border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center bg-white">
              <Code2 className="h-5 w-5 text-zinc-950" strokeWidth={2.5} />
            </div>
            <span className="text-lg font-bold tracking-tight">ContribIQ</span>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-2 rounded-sm border border-zinc-800 bg-zinc-900/50 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800 hover:text-white">
            <LogOut className="h-4 w-4" /> Sign Out
          </button>
        </div>
      </nav>

      <div className="fixed inset-0 z-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none"></div>

      <div className="relative z-10 mx-auto max-w-7xl p-6 sm:p-10 space-y-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_350px]">
          {/* Left Column */}
          <div className="space-y-8">
            <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-8">
              <div className="flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
                {avatarUrl ? (
                  <div className="h-20 w-20 flex-shrink-0 border border-zinc-800 bg-zinc-900 p-1 rounded-sm">
                    <img src={avatarUrl} alt={name} className="h-full w-full object-cover rounded-sm grayscale hover:grayscale-0 transition-all" />
                  </div>
                ) : (
                  <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center border border-zinc-800 bg-zinc-900 rounded-sm">
                    <User className="h-8 w-8 text-zinc-500" />
                  </div>
                )}
                <div className="space-y-2">
                  <h2 className="text-3xl font-bold tracking-tight text-white">Welcome back, {name}</h2>
                  <p className="text-zinc-400 max-w-lg leading-relaxed">We've analyzed your GitHub history. Check out your personalized open-source recommendations based on your skill fingerprint.</p>
                  {username && (
                    <div className="inline-flex items-center gap-2 rounded-sm border border-zinc-800 bg-zinc-900/50 px-3 py-1 text-xs font-medium text-zinc-400 mt-2">
                      <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" /></svg>
                      github.com/{username}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold tracking-tight text-zinc-100 flex items-center gap-2"><Star className="h-5 w-5 text-zinc-400" />Recommended Issues</h3>
                <span className="rounded-sm bg-zinc-900 px-3 py-1 text-xs font-medium text-zinc-400 border border-zinc-800">Coming Soon</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {[1, 2].map((i) => (
                  <div key={i} className="group cursor-pointer rounded-sm border border-zinc-800 bg-zinc-950 p-6 transition-all hover:border-zinc-600 hover:bg-zinc-900/50">
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2"><span className="text-xs font-medium text-zinc-500">facebook/react</span></div>
                        <h4 className="font-semibold text-zinc-200 group-hover:text-white transition-colors line-clamp-2">Bug: Hydration mismatch on server render</h4>
                      </div>
                      <div className="rounded-sm bg-zinc-900 border border-zinc-800 p-2 text-zinc-400 group-hover:border-zinc-600 group-hover:text-zinc-300 transition-colors"><GitPullRequest className="h-4 w-4" /></div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-sm bg-zinc-900 px-2 py-1 text-[10px] font-medium text-zinc-400 border border-zinc-800">React</span>
                      <span className="rounded-sm bg-zinc-900 px-2 py-1 text-[10px] font-medium text-zinc-400 border border-zinc-800">Good first issue</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Actual Skill Profile */}
          <div className="space-y-6">
            <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                  <BookOpen className="h-4 w-4" /> Skill Profile
                </h3>
                <button
                  onClick={() => (editMode ? handleSaveSkills() : setEditMode(true))}
                  disabled={saving}
                  className={`flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs font-bold transition-colors ${editMode ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30" : "bg-zinc-900 text-zinc-400 border border-zinc-800 hover:bg-zinc-800 hover:text-white"}`}
                >
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : editMode ? <Save className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
                  {editMode ? "Save" : "Edit"}
                </button>
              </div>
              
              {editMode ? (
                // If editing from the dashboard, show the drag-and-drop UI
                <div className="space-y-4 -mx-2">
                  {renderSkillGroups()}
                </div>
              ) : (
                // Normal dashboard view - show progress bars for top skills
                <div className="space-y-5">
                  {skills.length > 0 ? (
                    // Show top 6 skills sorted by confidence
                    [...skills].sort((a, b) => b.confidence - a.confidence).slice(0, 6).map((skill) => {
                      const levelCfg = LEVEL_CONFIG[skill.level];
                      const percentage = Math.round(skill.confidence * 100);
                      return (
                        <div key={skill.name} className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <span className={`h-1.5 w-1.5 rounded-sm ${levelCfg.dot}`} />
                              <span className="font-medium text-zinc-300">{skill.name}</span>
                            </div>
                            <span className="text-zinc-500 font-medium">{percentage}%</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-sm bg-zinc-900 border border-zinc-800">
                            <div className={`h-full rounded-sm ${levelCfg.dot}`} style={{ width: `${percentage}%` }} />
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="text-center p-4">
                      <p className="text-sm text-zinc-500">No skills found. Let's analyze your profile.</p>
                      <button onClick={() => setViewState("onboarding")} className="mt-3 rounded-sm bg-emerald-500/20 px-3 py-1.5 text-xs font-bold text-emerald-400 hover:bg-emerald-500/30 transition-colors">
                        Run Analysis
                      </button>
                    </div>
                  )}
                  {skills.length > 6 && (
                    <p className="text-xs text-center text-zinc-600 font-medium pt-2">
                      + {skills.length - 6} more skills in your fingerprint
                    </p>
                  )}
                </div>
              )}
            </div>

            <details className="group rounded-sm border border-zinc-800 bg-zinc-950 p-4">
              <summary className="cursor-pointer text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors">View Raw Session Data</summary>
              <div className="mt-4 space-y-4">
                <div className="space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-600">Prisma Record</span>
                  <pre className="max-h-40 overflow-auto rounded-sm bg-zinc-900 p-3 text-[10px] text-zinc-400 border border-zinc-800 custom-scrollbar">
                    {JSON.stringify(dbUser, null, 2)}
                  </pre>
                </div>
              </div>
            </details>
          </div>
        </div>
      </div>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #27272a; border-radius: 2px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #3f3f46; }
      `}</style>
    </main>
  )
}
