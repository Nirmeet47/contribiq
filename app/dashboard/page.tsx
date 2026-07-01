"use client"

import { useEffect, useState, useRef } from "react"
import { createClient } from "@/utils/supabase/client"
import type { User as SupabaseUser } from "@supabase/supabase-js"
import { AppShell } from "@/app/app-shell"
import { IssueFeed } from "./issue-feed"
import { RightSidebar } from "./right-sidebar"
import { normalizeSkillName, skillIdentity } from "@/lib/skills"
import {
  LogOut, Code2, GitPullRequest, BookOpen,
  CheckCircle2, Loader2, XCircle, GitMerge, Brain, Fingerprint,
  ArrowRight, GripVertical, Pencil, Plus, Save, X, FolderGit2,
  Server, Container, TestTube2, Wrench, Smartphone, Clock,
} from "lucide-react"

// -- Types --
interface Skill {
  name: string
  level: "strong" | "moderate" | "learning"
  confidence: number
  repoCount: number
  commitCount: number
}

interface DbUser {
  name?: string | null
  username?: string | null
  avatarUrl?: string | null
  onboarded?: boolean
  profileAnalyzed?: boolean
  interests?: string[]
  timeCommitment?: number
}

type ViewState = "loading" | "onboarding" | "skills_review" | "interests" | "time_commitment" | "dashboard"

async function readJson<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? ""

  if (!contentType.includes("application/json")) {
    throw new Error(`Expected JSON from ${response.url || "request"}, got ${contentType || "unknown content type"}`)
  }

  return (await response.json()) as T
}

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

const INTEREST_OPTIONS = [
  { value: "frontend", label: "Frontend", icon: Code2 },
  { value: "backend", label: "Backend", icon: Server },
  { value: "ai", label: "AI", icon: Brain },
  { value: "devops", label: "DevOps", icon: Container },
  { value: "docs", label: "Docs", icon: BookOpen },
  { value: "testing", label: "Testing", icon: TestTube2 },
  { value: "tools", label: "Tools", icon: Wrench },
  { value: "mobile", label: "Mobile", icon: Smartphone },
]

const TIME_OPTIONS = [
  { label: "< 5 hrs / week", value: 4, detail: "Light weekly pace" },
  { label: "5-10 hrs / week", value: 7, detail: "Steady contribution rhythm" },
  { label: "10+ hrs / week", value: 12, detail: "Deep focus capacity" },
]

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
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [dbUser, setDbUser] = useState<DbUser | null>(null)
  const [viewState, setViewState] = useState<ViewState>("loading")

  // -- Onboarding State --
  const [currentStep, setCurrentStep] = useState("fetching")
  const [message, setMessage] = useState("Connecting to GitHub...")
  const [isDone, setIsDone] = useState(false)
  const [isError, setIsError] = useState(false)
  const [sseRetryToken, setSseRetryToken] = useState(0)
  const sseStarted = useRef(false)
  const eventSourceRef = useRef<EventSource | null>(null)

  // -- Skills State --
  const [skills, setSkills] = useState<Skill[]>([])
  const [summary, setSummary] = useState({ totalCommits: 0, totalRepos: 0, mergedPRs: 0 })
  const [editMode, setEditMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedInterests, setSelectedInterests] = useState<string[]>([])
  const [selectedTimeCommitment, setSelectedTimeCommitment] = useState<number | null>(null)
  const [newSkillInputs, setNewSkillInputs] = useState<Record<Level, string>>({
    strong: "", moderate: "", learning: "",
  })
  const dragItem = useRef<{ name: string; fromLevel: Level } | null>(null)
  const [dragOverLevel, setDragOverLevel] = useState<Level | null>(null)

  // -- Helpers --
  async function fetchSkills() {
    try {
      const r = await fetch("/api/me/skills")
      if (r.status === 401) {
        window.location.href = "/login"
        return
      }
      if (!r.ok) throw new Error(`Failed to fetch skills: ${r.status}`)

      const data = await readJson<{ skills?: Skill[]; summary?: typeof summary }>(r)
      setSkills(data.skills ?? [])
      if (data.summary) {
        setSummary(data.summary)
      }
    } catch (e) {
      console.error("Failed to fetch skills", e)
    }
  }

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
        if (res.status === 401) {
          window.location.href = "/login"
          return
        }
        if (!res.ok) throw new Error(`Failed to load DB user: ${res.status}`)

        const data = await readJson<DbUser & { error?: unknown }>(res)
        if (data && !data.error) {
          setDbUser(data)
          const hasInterests = (data.interests?.length ?? 0) > 0
          const hasTimeCommitment = (data.timeCommitment ?? 0) > 0

          if (data.onboarded === false || !hasInterests || !hasTimeCommitment) {
            setSelectedInterests(data.interests ?? [])
            setSelectedTimeCommitment(data.timeCommitment && data.timeCommitment > 0 ? data.timeCommitment : null)

            if (data.profileAnalyzed) {
              await fetchSkills()
              setViewState(!hasInterests ? "interests" : !hasTimeCommitment ? "time_commitment" : "skills_review")
            } else {
              setViewState("onboarding")
            }
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
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (viewState !== "onboarding" || sseStarted.current) return

    if (dbUser?.onboarded) {
      void Promise.resolve().then(async () => {
        await fetchSkills()
        setViewState("dashboard")
      })
      return
    }

    sseStarted.current = true
    setIsError(false)
    setIsDone(false)
    setCurrentStep("fetching")
    setMessage("Connecting to GitHub...")

    const eventSource = new EventSource("/api/onboarding/progress")
    eventSourceRef.current = eventSource

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data)
      setIsError(false)
      setCurrentStep(data.step)
      setMessage(data.message)

      if (data.step === "done") {
        setIsDone(true)
        eventSource.close()
        eventSourceRef.current = null
        // Wait a moment then transition to skills review
        setTimeout(() => {
          fetchSkills()
          setViewState("skills_review")
        }, 2000)
      }

      if (data.step === "error") {
        setIsError(true)
        eventSource.close()
        eventSourceRef.current = null
      }
    }

    eventSource.onerror = () => {
      setIsError(true)
      setMessage("Lost connection to the analysis server.")
      eventSource.close()
      eventSourceRef.current = null
    }

    return () => {
      eventSource.close()
      if (eventSourceRef.current === eventSource) {
        eventSourceRef.current = null
      }
    }
  }, [viewState, sseRetryToken, dbUser?.onboarded])
  /* eslint-enable react-hooks/set-state-in-effect */

  const retryOnboardingAnalysis = () => {
    if (dbUser?.onboarded) {
      fetchSkills()
      setViewState("dashboard")
      return
    }

    eventSourceRef.current?.close()
    eventSourceRef.current = null
    sseStarted.current = false
    setIsError(false)
    setIsDone(false)
    setCurrentStep("fetching")
    setMessage("Connecting to GitHub...")
    setViewState("onboarding")
    setSseRetryToken((value) => value + 1)
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
    setViewState("interests")
  }

  const toggleInterest = (interest: string) => {
    setSelectedInterests((prev) =>
      prev.includes(interest)
        ? prev.filter((value) => value !== interest)
        : [...prev, interest]
    )
  }

  const handleCompletePreferences = async () => {
    if (selectedInterests.length === 0 || selectedTimeCommitment === null) return

    setSaving(true)
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interests: selectedInterests,
          timeCommitment: selectedTimeCommitment,
          onboarded: true,
        }),
      })

      if (!res.ok) {
        throw new Error("Failed to save onboarding preferences")
      }

      await fetchSkills()
      setViewState("dashboard")
    } catch (err) {
      console.error("Failed to complete onboarding:", err)
    } finally {
      setSaving(false)
    }
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
    const name = normalizeSkillName(newSkillInputs[level])
    if (!name || skills.some((s) => skillIdentity(s.name) === skillIdentity(name))) return
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
            <button onClick={retryOnboardingAnalysis} className="w-full rounded-sm bg-white px-4 py-3 text-sm font-bold text-zinc-950 transition-colors hover:bg-zinc-200">
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
                {!editMode && <span className="text-[10px] opacity-60">{config.label}</span>}
                {editMode && (
                  <button
                    type="button"
                    onClick={() => setSkills((p) => p.filter((s) => s.name !== skill.name))}
                    className="ml-1 opacity-50 transition-opacity hover:opacity-100"
                    aria-label={`Remove ${skill.name}`}
                    title={`Remove ${skill.name}`}
                  >
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
                placeholder="Add a skill..."
                className="flex-1 rounded-sm border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 placeholder:text-zinc-600 focus:border-zinc-700 focus:outline-none"
              />
              <button type="button" onClick={() => handleAddSkill(level)} className={`flex items-center gap-1 rounded-sm border px-3 py-1.5 text-xs font-bold transition-colors ${config.border} ${config.text} hover:${config.bg}`}>
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
                <p className="text-xs font-bold uppercase tracking-widest text-emerald-500">Step 2 of 4</p>
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
            {/* eslint-disable-next-line react-hooks/refs */}
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

  if (viewState === "interests") {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-50 font-sans selection:bg-emerald-500/30">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
        <div className="relative z-10 mx-auto max-w-4xl px-6 py-16 space-y-10">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Step 3 of 4 - What do you want to work on?</h1>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {INTEREST_OPTIONS.map((interest) => {
              const Icon = interest.icon
              const active = selectedInterests.includes(interest.value)
              return (
                <button
                  key={interest.value}
                  type="button"
                  onClick={() => toggleInterest(interest.value)}
                  className={`flex min-h-32 flex-col justify-between rounded-sm border p-4 text-left transition-all ${active ? "border-emerald-500 bg-emerald-500/10 text-emerald-300 shadow-[0_0_0_1px_rgba(16,185,129,0.15)]" : "border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900/70"}`}
                >
                  <div className="flex items-start justify-between">
                    <Icon className={`h-5 w-5 ${active ? "text-emerald-400" : "text-zinc-500"}`} />
                    <span className={`flex h-5 w-9 items-center rounded-full border p-0.5 transition-colors ${active ? "border-emerald-500/40 bg-emerald-500/20" : "border-zinc-700 bg-zinc-900"}`}>
                      <span className={`h-3.5 w-3.5 rounded-full transition-transform ${active ? "translate-x-3.5 bg-emerald-400" : "translate-x-0 bg-zinc-600"}`} />
                    </span>
                  </div>
                  <span className="text-base font-bold">{interest.label}</span>
                </button>
              )
            })}
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => setViewState("time_commitment")}
              disabled={selectedInterests.length === 0}
              className="flex items-center gap-2 rounded-sm bg-emerald-500 px-6 py-3 text-sm font-bold text-zinc-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
            >
              Continue <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </main>
    )
  }

  if (viewState === "time_commitment") {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-50 font-sans selection:bg-emerald-500/30">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
        <div className="relative z-10 mx-auto max-w-3xl px-6 py-16 space-y-10">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Step 4 of 4 - How much time can you commit?</h1>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {TIME_OPTIONS.map((option) => {
              const active = selectedTimeCommitment === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSelectedTimeCommitment(option.value)}
                  className={`min-h-36 rounded-sm border p-5 text-left transition-all ${active ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300" : "border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900/70"}`}
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
              )
            })}
          </div>

          <div className="flex justify-between">
            <button onClick={() => setViewState("interests")} className="rounded-sm border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm font-bold text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white">
              Back
            </button>
            <button
              onClick={handleCompletePreferences}
              disabled={selectedTimeCommitment === null || saving}
              className="flex items-center gap-2 rounded-sm bg-emerald-500 px-6 py-3 text-sm font-bold text-zinc-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Let's Go"} {!saving && <ArrowRight className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </main>
    )
  }

  const name = dbUser?.name || user?.user_metadata?.full_name || "Developer"

  return (
    <AppShell>
        <section className="p-6 sm:p-8">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-zinc-500">Welcome back</p>
              <h1 className="text-2xl font-bold tracking-tight">{name}</h1>
            </div>
            <button onClick={handleLogout} className="flex items-center gap-2 rounded-sm border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 md:hidden">
              <LogOut className="h-4 w-4" /> Sign Out
            </button>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <IssueFeed />
            </div>
            <RightSidebar />
          </div>
        </section>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #27272a; border-radius: 2px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #3f3f46; }
      `}</style>
    </AppShell>
  )
}
