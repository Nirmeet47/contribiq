"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Code2, GitPullRequest, ShieldCheck, Sparkles, Star, Terminal } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);

  async function handleGithubLogin() {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
        scopes: "read:user repo",
      },
    });
  }

  return (
    <main className="flex min-h-screen flex-col overflow-hidden bg-zinc-950 font-sans text-zinc-50 selection:bg-emerald-500/30">
      <nav className="sticky top-0 z-50 border-b border-zinc-900 bg-zinc-950/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center bg-white">
              <Code2 className="h-5 w-5 text-zinc-950" strokeWidth={2.5} />
            </div>
            <span className="text-lg font-bold tracking-tight">ContribIQ</span>
          </Link>
          <Link
            href="/projects"
            className="hidden rounded-sm border border-zinc-800 px-3 py-2 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-900 hover:text-white sm:inline-flex"
          >
            Explore projects
          </Link>
        </div>
      </nav>

      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
      <div className="pointer-events-none fixed inset-x-0 top-16 h-64 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.16),transparent_60%)]" />

      <section className="relative mx-auto grid w-full max-w-7xl flex-1 items-center gap-10 px-6 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:py-20">
        <div className="max-w-2xl">
          <div className="mb-8 inline-flex items-center gap-2 rounded-sm border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-emerald-300">
            <Terminal className="h-3.5 w-3.5" />
            GitHub powered matching
          </div>
          <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
            Find the open-source issue that fits your actual code history.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-zinc-400 sm:text-lg">
            Continue with GitHub. ContribIQ turns your repositories, commits, and merged work into a skill profile, then ranks issues you can realistically ship.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              { label: "Skill graph", value: "AI-built" },
              { label: "Issue match", value: "Ranked" },
              { label: "Repo access", value: "Read only" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-sm border border-zinc-800 bg-zinc-950/75 p-4">
                <p className="text-lg font-bold text-white">{stat.value}</p>
                <p className="mt-1 text-xs font-medium text-zinc-500">{stat.label}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 space-y-3 text-sm font-medium text-zinc-300">
            {[
              "Personalized issue feed after first login",
              "Contribution summaries update your profile automatically",
              "No write permissions to your repositories",
            ].map((item) => (
              <div key={item} className="flex items-center gap-3">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="w-full">
          <div className="mx-auto w-full max-w-md rounded-sm border border-zinc-800 bg-zinc-950/90 p-2 shadow-2xl shadow-black/50">
            <div className="border border-zinc-900 bg-zinc-900/70 p-6 sm:p-8">
              <div className="mb-8 flex items-start justify-between gap-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-emerald-400">Welcome</p>
                  <h2 className="mt-2 text-2xl font-bold tracking-tight text-white">
                    Continue with GitHub
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-zinc-400">
                    One GitHub connection opens your profile, dashboard, recommendations, and contribution tracking.
                  </p>
                </div>
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-sm border border-zinc-800 bg-zinc-950">
                  <Sparkles className="h-5 w-5 text-emerald-300" />
                </div>
              </div>

              <button
                onClick={handleGithubLogin}
                disabled={loading}
                className="group flex min-h-12 w-full items-center justify-between gap-3 rounded-sm bg-emerald-500 px-5 py-3 text-sm font-bold text-zinc-950 shadow-sm shadow-emerald-950/40 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="flex items-center gap-3">
                  {loading ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-900/40 border-t-zinc-950" />
                  ) : (
                    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                    </svg>
                  )}
                  <span>{loading ? "Redirecting to GitHub..." : "Continue with GitHub"}</span>
                </div>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>

              <div className="mt-6 grid gap-3 text-sm text-zinc-300">
                <div className="flex items-start gap-3 rounded-sm border border-zinc-800 bg-zinc-950/70 p-3">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <p className="leading-6">We request read access only, so ContribIQ can analyze your profile without changing repository state.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-sm border border-zinc-800 bg-zinc-950/70 p-3">
                    <GitPullRequest className="mb-3 h-4 w-4 text-zinc-400" />
                    <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Matches</p>
                    <p className="mt-1 font-semibold text-white">Ready issues</p>
                  </div>
                  <div className="rounded-sm border border-zinc-800 bg-zinc-950/70 p-3">
                    <Star className="mb-3 h-4 w-4 text-zinc-400" />
                    <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Profile</p>
                    <p className="mt-1 font-semibold text-white">Auto-built</p>
                  </div>
                </div>
              </div>

              <p className="mt-6 text-xs leading-6 text-zinc-500">
                By continuing, you grant read access to your public repositories and commit history. We never write to your repos.
              </p>
            </div>

            <Link
              href="/"
              className="mt-4 flex h-10 items-center justify-center rounded-sm text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-white"
            >
              Back to ContribIQ
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
