"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/utils/supabase/client"
import { useRouter } from "next/navigation"
import { LogOut, Code2, GitPullRequest, Star, User, BookOpen } from "lucide-react"

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null)
  const [dbUser, setDbUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function loadData() {
      // Get session from Supabase
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)

      // Fetch synced user from our DB
      try {
        const res = await fetch("/api/me")
        const data = await res.json()
        if (data && !data.error) {
          setDbUser(data)
        }
      } catch (err) {
        console.error("Failed to load DB user", err)
      } finally {
        setLoading(false)
      }
    }
    
    loadData()
  }, [supabase.auth])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push("/login")
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-50">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-sm border-2 border-zinc-700 border-t-zinc-300" />
          <p className="text-sm font-medium text-zinc-400">Loading your profile...</p>
        </div>
      </main>
    )
  }

  const avatarUrl = dbUser?.avatarUrl || user?.user_metadata?.avatar_url
  const name = dbUser?.name || user?.user_metadata?.full_name || "Developer"
  const username = dbUser?.username || user?.user_metadata?.preferred_username

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50 font-sans selection:bg-indigo-500/30">
      {/* Top Navigation */}
      <nav className="border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center bg-white">
              <Code2 className="h-5 w-5 text-zinc-950" strokeWidth={2.5} />
            </div>
            <span className="text-lg font-bold tracking-tight">ContribIQ</span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 rounded-sm border border-zinc-800 bg-zinc-900/50 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </nav>

      {/* Subtle background grid pattern */}
      <div className="fixed inset-0 z-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none"></div>

      <div className="relative z-10 mx-auto max-w-7xl p-6 sm:p-10 space-y-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
          {/* Left Column: Activity & Recommendations */}
          <div className="space-y-8">
            {/* Welcome Banner */}
            <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-8">
              <div className="flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
                {avatarUrl ? (
                  <div className="h-20 w-20 flex-shrink-0 border border-zinc-800 bg-zinc-900 p-1 rounded-sm">
                    <img
                      src={avatarUrl}
                      alt={name}
                      className="h-full w-full object-cover rounded-sm grayscale hover:grayscale-0 transition-all"
                    />
                  </div>
                ) : (
                  <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center border border-zinc-800 bg-zinc-900 rounded-sm">
                    <User className="h-8 w-8 text-zinc-500" />
                  </div>
                )}
                
                <div className="space-y-2">
                  <h2 className="text-3xl font-bold tracking-tight text-white">
                    Welcome back, {name}
                  </h2>
                  <p className="text-zinc-400 max-w-lg leading-relaxed">
                    We're analyzing your GitHub history to find the perfect open-source issues for you. Check out your personalized recommendations below.
                  </p>
                  {username && (
                    <div className="inline-flex items-center gap-2 rounded-sm border border-zinc-800 bg-zinc-900/50 px-3 py-1 text-xs font-medium text-zinc-400 mt-2">
                      <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
                        <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                      </svg>
                      github.com/{username}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Recommendations Placeholder */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold tracking-tight text-zinc-100 flex items-center gap-2">
                  <Star className="h-5 w-5 text-zinc-400" />
                  Recommended Issues
                </h3>
                <span className="rounded-sm bg-zinc-900 px-3 py-1 text-xs font-medium text-zinc-400 border border-zinc-800">
                  Coming Soon
                </span>
              </div>
              
              <div className="grid gap-4 sm:grid-cols-2">
                {[1, 2].map((i) => (
                  <div key={i} className="group cursor-pointer rounded-sm border border-zinc-800 bg-zinc-950 p-6 transition-all hover:border-zinc-600 hover:bg-zinc-900/50">
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-zinc-500">facebook/react</span>
                        </div>
                        <h4 className="font-semibold text-zinc-200 group-hover:text-white transition-colors line-clamp-2">
                          Bug: Hydration mismatch on server render
                        </h4>
                      </div>
                      <div className="rounded-sm bg-zinc-900 border border-zinc-800 p-2 text-zinc-400 group-hover:border-zinc-600 group-hover:text-zinc-300 transition-colors">
                        <GitPullRequest className="h-4 w-4" />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-sm bg-zinc-900 px-2 py-1 text-[10px] font-medium text-zinc-400 border border-zinc-800">
                        React
                      </span>
                      <span className="rounded-sm bg-zinc-900 px-2 py-1 text-[10px] font-medium text-zinc-400 border border-zinc-800">
                        Good first issue
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Profile Stats */}
          <div className="space-y-6">
            <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-6">
              <h3 className="mb-6 text-sm font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                Skill Profile
              </h3>
              
              {/* Dummy Skills */}
              <div className="space-y-5">
                {[
                  { name: "TypeScript", level: 85 },
                  { name: "React", level: 92 },
                  { name: "Node.js", level: 78 },
                ].map((skill) => (
                  <div key={skill.name} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-zinc-300">{skill.name}</span>
                      <span className="text-zinc-500 font-medium">{skill.level}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-sm bg-zinc-900 border border-zinc-800">
                      <div
                        className="h-full bg-zinc-400 rounded-sm"
                        style={{ width: `${skill.level}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 rounded-sm border border-zinc-800 bg-zinc-900/50 p-4 text-center">
                <p className="text-xs text-zinc-500 font-medium leading-relaxed">
                  Your profile is currently being built by analyzing your past open source contributions.
                </p>
              </div>
            </div>

            {/* Debug Info */}
            <details className="group rounded-sm border border-zinc-800 bg-zinc-950 p-4">
              <summary className="cursor-pointer text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors">
                View Raw Session Data
              </summary>
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
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #27272a;
          border-radius: 2px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #3f3f46;
        }
      `}</style>
    </main>
  )
}
