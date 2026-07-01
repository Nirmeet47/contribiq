import Link from "next/link"
import { ArrowRight, Code2, GitMerge, GitPullRequest, Search, Star, Terminal, Cpu, Layers, Zap } from "lucide-react"

import { createClient } from "@/utils/supabase/server"

type GitHubSearchRepo = {
  id: number;
  full_name: string;
  description: string | null;
  stargazers_count: number;
  open_issues_count: number;
  language: string | null;
  html_url: string;
  owner: {
    login: string;
    avatar_url: string;
  };
};

async function getTopRepos() {
  try {
    const res = await fetch(
      "https://api.github.com/search/repositories?q=stars:>10000+good-first-issues:>0&per_page=6&sort=stars",
      { next: { revalidate: 3600 } } // Cache for an hour
    )
    if (!res.ok) return []
    const data = (await res.json()) as { items?: GitHubSearchRepo[] }
    return data.items || []
  } catch {
    return []
  }
}

const HOW_IT_WORKS_STEPS = [
  {
    step: "01",
    icon: Cpu,
    title: "Analyze your GitHub history",
    description:
      "Connect your GitHub account. ContribIQ reads your commits, merged PRs, and language patterns — building a precise skill profile, not a vague tag cloud.",
    detail: "Skill Profiling Agent · LangChain + Claude",
  },
  {
    step: "02",
    icon: Layers,
    title: "Match against classified issues",
    description:
      "Every open issue across 50+ curated repos is classified by difficulty, required skills, and type. A cosine-similarity engine scores each issue against your profile.",
    detail: "pgvector embeddings · weighted scoring",
  },
  {
    step: "03",
    icon: GitPullRequest,
    title: "Contribute. Get credit.",
    description:
      "Pick an issue, open a PR. When it merges, a webhook captures your contribution, summarizes the diff with AI, and updates your skill graph automatically.",
    detail: "Contribution Summary Agent · real-time webhooks",
  },
]

export default async function Home() {
  const repos = await getTopRepos()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50 font-sans selection:bg-indigo-500/30">
      {/* Navigation */}
      <nav className="border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center bg-white">
              <Code2 className="h-5 w-5 text-zinc-950" strokeWidth={2.5} />
            </div>
            <span className="text-lg font-bold tracking-tight">ContribIQ</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/projects"
              className="hidden rounded-sm px-3 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-white sm:flex"
            >
              Projects
            </Link>
            {user ? (
              <Link
                href="/dashboard"
                className="flex items-center gap-2 rounded-sm bg-white px-4 py-2 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-200"
              >
                Go to Dashboard
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <Link
                href="/login"
                className="flex items-center gap-2 rounded-sm bg-white px-4 py-2 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-200"
              >
                Get Started
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-zinc-900 pt-32 pb-24">
        {/* Subtle background grid pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>

        <div className="relative mx-auto max-w-7xl px-6 text-center">
          <div className="inline-flex items-center gap-2 border border-zinc-800 bg-zinc-900/50 px-3 py-1 text-xs font-medium text-zinc-400 mb-8 rounded-sm backdrop-blur-sm">
            <Terminal className="h-3 w-3" />
            v0.1.0-alpha is now live
          </div>
          <h1 className="mx-auto max-w-4xl text-5xl font-bold tracking-tighter sm:text-7xl">
            Open-source matching, <br className="hidden sm:block" />
            <span className="text-zinc-500">engineered for scale.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-zinc-400">
            ContribIQ analyzes your codebase activity, cross-references open issues, and connects you directly with the high-impact pull requests you were meant to build.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/login"
              className="flex h-12 w-full sm:w-auto items-center justify-center gap-2 rounded-sm bg-white px-8 font-medium text-zinc-950 transition-colors hover:bg-zinc-200"
            >
              Start Contributing
            </Link>
            <Link
              href="/projects"
              className="flex h-12 w-full sm:w-auto items-center justify-center gap-2 rounded-sm border border-zinc-800 bg-transparent px-8 font-medium text-zinc-300 transition-colors hover:bg-zinc-900"
            >
              <Search className="h-4 w-4" />
              Explore Repositories
            </Link>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="border-b border-zinc-900">
        <div className="mx-auto max-w-7xl px-6 py-24">
          {/* Header */}
          <div className="mb-16 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div>
              <p className="text-xs font-mono font-medium text-indigo-400 uppercase tracking-widest mb-3">
                How It Works
              </p>
              <h2 className="text-3xl font-bold tracking-tight max-w-sm">
                From commit history to the right issue — in minutes.
              </h2>
            </div>
            <p className="max-w-xs text-sm text-zinc-500 leading-relaxed md:text-right">
              Three AI agents run in sequence so you never have to manually search for where to contribute.
            </p>
          </div>

          {/* Steps */}
          <div className="relative grid gap-0 md:grid-cols-3">
            {/* Connector line — desktop only */}
            <div className="absolute top-[2.75rem] left-[calc(16.666%+1.5rem)] right-[calc(16.666%+1.5rem)] hidden md:block h-px bg-gradient-to-r from-zinc-800 via-indigo-900/60 to-zinc-800" />

            {HOW_IT_WORKS_STEPS.map(({ step, icon: Icon, title, description, detail }, i) => (
              <div key={step} className="relative flex flex-col">
                {/* Mobile connector */}
                {i < HOW_IT_WORKS_STEPS.length - 1 && (
                  <div className="md:hidden absolute left-[1.875rem] top-[5.5rem] bottom-0 w-px bg-zinc-800" />
                )}

                <div className="flex items-start gap-5 md:flex-col md:gap-0 p-6 md:p-8 group">
                  {/* Step badge + icon */}
                  <div className="relative flex-shrink-0 md:mb-8">
                    <div className="flex h-11 w-11 items-center justify-center border border-zinc-800 bg-zinc-950 transition-colors group-hover:border-indigo-800 group-hover:bg-indigo-950/30">
                      <Icon className="h-5 w-5 text-zinc-400 group-hover:text-indigo-400 transition-colors" strokeWidth={1.5} />
                    </div>
                    <span className="absolute -top-2.5 -right-2.5 font-mono text-[10px] font-bold text-indigo-500 bg-zinc-950 px-0.5">
                      {step}
                    </span>
                  </div>

                  {/* Content */}
                  <div className="md:mt-0">
                    <h3 className="text-base font-semibold tracking-tight text-zinc-100 mb-2 md:mb-3">
                      {title}
                    </h3>
                    <p className="text-sm text-zinc-400 leading-relaxed mb-4">
                      {description}
                    </p>
                    <span className="inline-block font-mono text-[11px] text-indigo-500/70 bg-indigo-950/20 border border-indigo-900/40 px-2 py-0.5">
                      {detail}
                    </span>
                  </div>
                </div>

                {/* Right border divider between columns — desktop */}
                {i < HOW_IT_WORKS_STEPS.length - 1 && (
                  <div className="hidden md:block absolute top-0 right-0 bottom-0 w-px bg-zinc-900" />
                )}
              </div>
            ))}
          </div>

          {/* Bottom CTA strip */}
          <div className="mt-12 flex items-center justify-between border border-zinc-800/60 bg-zinc-900/30 px-6 py-4 rounded-sm">
            <div className="flex items-center gap-3">
              <Zap className="h-4 w-4 text-indigo-400 flex-shrink-0" />
              <p className="text-sm text-zinc-400">
                The whole pipeline — auth, profiling, matching — runs end-to-end before you see your first issue.
              </p>
            </div>
            <Link
              href="/login"
              className="hidden sm:flex items-center gap-1.5 text-sm font-medium text-white hover:text-zinc-300 transition-colors flex-shrink-0 ml-6"
            >
              Try it free <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Live GitHub Data Section */}
      <section id="explore" className="mx-auto max-w-7xl px-6 py-24">
        <div className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Active Ecosystems</h2>
            <p className="mt-2 text-zinc-400">Live data fetched from GitHub representing top open-source projects.</p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-500 font-medium">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Live Sync
            </div>
            <Link
              href="/projects"
              className="inline-flex items-center gap-1.5 rounded-sm border border-zinc-800 px-3 py-2 text-xs font-bold text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-white"
            >
              Explore all repositories <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {repos.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {repos.map((repo) => (
              <div
                key={repo.id}
                className="group relative flex flex-col justify-between rounded-sm border border-zinc-800 bg-zinc-950 p-6 transition-all hover:border-zinc-600 hover:bg-zinc-900/50"
              >
                <div>
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex h-10 w-10 items-center justify-center border border-zinc-800 bg-zinc-900 rounded-sm">
                      <img
                        src={repo.owner.avatar_url}
                        alt={repo.owner.login}
                        className="h-6 w-6 opacity-80 grayscale group-hover:grayscale-0 transition-all"
                      />
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-400">
                      <Star className="h-3.5 w-3.5" />
                      {(repo.stargazers_count / 1000).toFixed(1)}k
                    </div>
                  </div>
                  <h3 className="text-lg font-semibold tracking-tight text-zinc-100 group-hover:text-white transition-colors">
                    {repo.full_name}
                  </h3>
                  <p className="mt-2 text-sm text-zinc-400 line-clamp-2">
                    {repo.description}
                  </p>
                </div>

                <div className="mt-6 flex items-center justify-between border-t border-zinc-800/50 pt-4">
                  <div className="flex items-center gap-3 text-xs font-medium text-zinc-500">
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-sm bg-indigo-500"></span>
                      {repo.language || "Mixed"}
                    </span>
                    <span className="flex items-center gap-1">
                      <GitMerge className="h-3.5 w-3.5" />
                      {repo.open_issues_count} issues
                    </span>
                  </div>
                  <a
                    href={repo.html_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-zinc-300 hover:text-white transition-colors flex items-center gap-1"
                  >
                    View <ArrowRight className="h-3 w-3" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-64 items-center justify-center rounded-sm border border-zinc-800 bg-zinc-900/20">
            <p className="text-sm font-medium text-zinc-500">Unable to fetch repository data. Rate limit may be exceeded.</p>
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-900 bg-zinc-950 py-12 text-center text-sm font-medium text-zinc-600">
        <div className="mx-auto max-w-7xl px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 bg-zinc-800"></div>
            ContribIQ
          </div>
          <p>© {new Date().getFullYear()} ContribIQ. All rights reserved.</p>
        </div>
      </footer>
    </main>
  )
}
