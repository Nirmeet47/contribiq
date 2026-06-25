"use client"

import { useState } from "react"
import { createClient } from "@/utils/supabase/client"
import { Code2, ArrowRight } from "lucide-react"
import Link from "next/link"

export default function LoginPage() {
  const [loading, setLoading] = useState(false)

  const handleGithubLogin = async () => {
    setLoading(true)
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
        scopes: "read:user repo",
      },
    })
  }

  return (
    <main className="min-h-screen bg-white text-zinc-950 font-sans selection:bg-indigo-500/20 flex flex-col">
      {/* Nav */}
      <nav className="border-b border-zinc-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center bg-zinc-950">
              <Code2 className="h-5 w-5 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-lg font-bold tracking-tight">ContribIQ</span>
          </Link>
        </div>
      </nav>

      {/* Subtle grid background */}
      <div className="fixed inset-0 bg-[linear-gradient(to_right,#00000008_1px,transparent_1px),linear-gradient(to_bottom,#00000008_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

      {/* Center card */}
      <div className="relative flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          {/* Header icon — same block used in nav, scaled up */}
          <div className="mb-10 flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center bg-zinc-950">
              <Code2 className="h-8 w-8 text-white" strokeWidth={2.5} />
            </div>
          </div>

          <div className="border border-zinc-200 bg-white p-8 shadow-sm">
            <h1 className="text-2xl font-bold tracking-tight mb-2 text-zinc-950">
              Sign in to ContribIQ
            </h1>
            <p className="text-sm text-zinc-500 leading-relaxed mb-8">
              Connect your GitHub account. We'll analyze your history and surface the open-source issues built for your skill set.
            </p>

            <button
              onClick={handleGithubLogin}
              disabled={loading}
              className="group flex w-full items-center justify-between gap-3 border border-zinc-900 bg-zinc-950 px-5 py-3.5 text-sm font-medium text-white transition-all hover:bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <div className="flex items-center gap-3">
                {loading ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-white" />
                ) : (
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 text-zinc-300">
                    <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                  </svg>
                )}
                <span>{loading ? "Redirecting…" : "Continue with GitHub"}</span>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-zinc-400 group-hover:text-white transition-colors" />
            </button>

            <p className="mt-6 text-[11px] text-zinc-400 leading-relaxed">
              By continuing, you grant read access to your public repositories and commit history. We never write to your repos.
            </p>
          </div>

          {/* Back link */}
          <div className="mt-6 text-center">
            <Link href="/" className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors">
              ← Back to ContribIQ
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}