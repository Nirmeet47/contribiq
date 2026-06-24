"use client"

import { useState } from "react"
import { createClient } from "@/utils/supabase/client"

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  
  const handleGithubLogin = async () => {
    setLoading(true)
    const supabase = createClient()
    
    // Redirect to the auth callback route which will then send us to the dashboard
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
        scopes: "read:user repo", // We need 'repo' to read PRs and 'read:user' for profile info
      },
    })
    // NOTE: signInWithOAuth does a full page redirect, so we won't hit setLoading(false) here.
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 p-6 text-zinc-950">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-sm text-center">
        <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-2xl">
          🚀
        </div>
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">Sign in to ContribIQ</h1>
        <p className="mb-8 text-sm text-zinc-500">
          Match with open-source issues tailored to your skills.
        </p>

        <button
          onClick={handleGithubLogin}
          disabled={loading}
          className="flex w-full items-center justify-center gap-3 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
          )}
          Continue with GitHub
        </button>
      </div>
    </main>
  )
}
