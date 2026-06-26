"use client";

import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/app/app-shell";
import {
  ArrowDown,
  Clock,
  GitPullRequest,
  Loader2,
  Send,
  Star,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, use, useState } from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
} from "recharts";

type Difficulty = "beginner" | "intermediate" | "advanced";
type IssueType = "bug" | "feature" | "docs" | "refactor";

type ProjectIssue = {
  id: string;
  title: string;
  aiSummary: string | null;
  difficulty: Difficulty | null;
  issueType: IssueType | null;
  estimatedHours: number | null;
  githubUrl: string;
  requiredSkills: string[];
};

type ProjectResponse = {
  repo: {
    id: string;
    owner: string;
    name: string;
    description: string | null;
    stars: number;
    language: string | null;
    categories: string[];
    maintainerScore: number;
    activityScore: number;
  };
  issueBreakdown: Record<IssueType, number>;
  techStack: string[];
  openIssues: ProjectIssue[];
};

const ISSUE_META: Record<IssueType, { label: string; color: string }> = {
  bug: { label: "Bug", color: "#f87171" },
  feature: { label: "Feature", color: "#34d399" },
  docs: { label: "Docs", color: "#60a5fa" },
  refactor: { label: "Refactor", color: "#fbbf24" },
};

const SUGGESTED_QUESTIONS = [
  "How do I set up locally?",
  "What is the architecture?",
  "What conventions should I follow?",
];

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function percent(value: number) {
  return Math.round(Math.max(0, Math.min(1, value)) * 100);
}

async function fetchProject(repoId: string) {
  const response = await fetch(`/api/projects/${repoId}`);
  if (!response.ok) throw new Error("Failed to load project");
  return (await response.json()) as ProjectResponse;
}

async function streamProjectAnswer(
  repoId: string,
  query: string,
  onToken: (token: string) => void
) {
  const response = await fetch(`/api/projects/${repoId}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!response.ok) throw new Error("Failed to ask project docs");
  if (!response.body) throw new Error("Project docs response did not stream");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    onToken(decoder.decode(value, { stream: true }));
  }

  const remainder = decoder.decode();
  if (remainder) onToken(remainder);
}

function MetricBar({ label, value }: { label: string; value: number }) {
  const width = percent(value);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider">
        <span className="text-zinc-400">{label}</span>
        <span className="text-zinc-200">{width}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-sm bg-zinc-900">
        <div className="h-full rounded-sm bg-emerald-400" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function IssueCard({ issue }: { issue: ProjectIssue }) {
  return (
    <article className="rounded-sm border border-zinc-800 bg-zinc-950 p-5 transition-colors hover:border-zinc-700">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-zinc-500">
            {issue.difficulty && <span>{titleCase(issue.difficulty)}</span>}
            {issue.issueType && <span>{titleCase(issue.issueType)}</span>}
          </div>
          <Link
            href={`/issues/${issue.id}`}
            className="group inline-flex items-start gap-2 text-base font-bold leading-6 text-zinc-100 hover:text-white"
          >
            {issue.title}
          </Link>
        </div>
      </div>

      <p className="mb-4 line-clamp-3 text-sm leading-6 text-zinc-400">
        {issue.aiSummary || "No AI summary available yet."}
      </p>

      <div className="mb-5 flex flex-wrap gap-2">
        {issue.difficulty && (
          <span className="rounded-sm border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-xs font-bold text-sky-300">
            {titleCase(issue.difficulty)}
          </span>
        )}
        {issue.estimatedHours !== null && (
          <span className="inline-flex items-center gap-1 rounded-sm border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs font-medium text-zinc-300">
            <Clock className="h-3 w-3" />
            {issue.estimatedHours}h
          </span>
        )}
        {issue.issueType && (
          <span className="inline-flex items-center gap-1 rounded-sm border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs font-medium text-zinc-300">
            <GitPullRequest className="h-3 w-3" />
            {titleCase(issue.issueType)}
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-wrap gap-2 border-t border-zinc-900 pt-4">
        {issue.requiredSkills.slice(0, 5).map((skill) => (
          <span key={skill} className="rounded-sm bg-zinc-900 px-2 py-1 text-[11px] font-medium text-zinc-500">
            {skill}
          </span>
        ))}
      </div>
    </article>
  );
}

export default function ProjectPage({
  params,
}: {
  params: Promise<{ repoId: string }>;
}) {
  const { repoId } = use(params);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [askError, setAskError] = useState(false);

  const projectQuery = useQuery({
    queryKey: ["project", repoId],
    queryFn: () => fetchProject(repoId),
  });

  const project = projectQuery.data;
  const pieData = project
    ? (Object.entries(project.issueBreakdown) as Array<[IssueType, number]>)
        .filter(([, value]) => value > 0)
        .map(([type, value]) => ({
          type,
          name: ISSUE_META[type].label,
          value,
        }))
    : [];

  async function askDocs(value: string) {
    const trimmed = value.trim();
    if (!trimmed || isAsking) return;

    setAnswer("");
    setAskError(false);
    setIsAsking(true);
    try {
      await streamProjectAnswer(repoId, trimmed, (token) => {
        setAnswer((current) => current + token);
      });
    } catch {
      setAskError(true);
    } finally {
      setIsAsking(false);
    }
  }

  function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    askDocs(question);
  }

  function askSuggested(value: string) {
    setQuestion(value);
    askDocs(value);
  }

  if (projectQuery.isLoading) {
    return (
      <AppShell>
      <section className="flex min-h-screen items-center justify-center text-zinc-50">
        <div className="flex items-center gap-3 text-sm font-medium text-zinc-400">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
          Loading project...
        </div>
      </section>
      </AppShell>
    );
  }

  if (projectQuery.isError || !project) {
    return (
      <AppShell>
      <section className="flex min-h-screen items-center justify-center p-6 text-zinc-50">
        <div className="rounded-sm border border-red-500/30 bg-red-500/10 p-5 text-sm font-medium text-red-300">
          Project could not be loaded.
        </div>
      </section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-8 px-6 py-10 sm:px-8">
        <header className="space-y-6 border-b border-zinc-900 pb-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-3">
              <p className="text-sm font-bold uppercase tracking-widest text-emerald-400">
                {project.repo.owner}
              </p>
              <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
                {project.repo.name}
              </h1>
              <p className="text-base leading-7 text-zinc-400">
                {project.repo.description || "No repository description available."}
              </p>
            </div>

            <a
              href="#issues"
              className="inline-flex items-center gap-2 rounded-sm bg-emerald-500 px-4 py-2 text-sm font-bold text-zinc-950 transition-colors hover:bg-emerald-400"
            >
              Explore Issues
              <ArrowDown className="h-4 w-4" />
            </a>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-sm border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-300">
              <Star className="h-4 w-4 text-amber-300" />
              {project.repo.stars.toLocaleString()}
            </span>
            {project.repo.language && (
              <span className="rounded-sm border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-sm font-bold text-sky-300">
                {project.repo.language}
              </span>
            )}
            {project.repo.categories.map((category) => (
              <span key={category} className="rounded-sm border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-400">
                {category}
              </span>
            ))}
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-5">
            <h2 className="mb-5 text-lg font-bold text-zinc-100">Project intelligence</h2>
            <div className="space-y-5">
              <MetricBar label="Activity" value={project.repo.activityScore} />
              <MetricBar label="Responsiveness" value={project.repo.maintainerScore} />
              <MetricBar
                label="Contribution Friendliness"
                value={(project.repo.activityScore + project.repo.maintainerScore) / 2}
              />
            </div>

            <div className="mt-6 border-t border-zinc-900 pt-5">
              <h3 className="mb-3 text-sm font-bold text-zinc-100">Tech stack</h3>
              <div className="flex flex-wrap gap-2">
                {project.techStack.length > 0 ? (
                  project.techStack.map((skill) => (
                    <span key={skill} className="rounded-sm border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs font-medium text-zinc-300">
                      {skill}
                    </span>
                  ))
                ) : (
                  <span className="text-sm font-medium text-zinc-500">No stack manifest found.</span>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-5">
            <h2 className="mb-4 text-lg font-bold text-zinc-100">Issue mix</h2>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData.length > 0 ? pieData : [{ type: "docs", name: "No issues", value: 1 }]}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={58}
                    outerRadius={86}
                    stroke="#09090b"
                    strokeWidth={4}
                  >
                    {(pieData.length > 0 ? pieData : [{ type: "docs" as IssueType, name: "No issues", value: 1 }]).map((item) => (
                      <Cell key={item.name} fill={pieData.length > 0 ? ISSUE_META[item.type].color : "#3f3f46"} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(ISSUE_META) as Array<[IssueType, { label: string; color: string }]>).map(([type, meta]) => (
                <div key={type} className="flex items-center justify-between rounded-sm border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-xs font-medium">
                  <span className="flex items-center gap-2 text-zinc-400">
                    <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: meta.color }} />
                    {meta.label}
                  </span>
                  <span className="text-zinc-200">{project.issueBreakdown[type]}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-sm border border-zinc-800 bg-zinc-950 p-5">
          <div className="mb-5 flex flex-col gap-2">
            <h2 className="text-lg font-bold text-zinc-100">Ask the project docs</h2>
            <p className="text-sm font-medium text-zinc-500">Answers are retrieved from the indexed README and contributing docs.</p>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            {SUGGESTED_QUESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => askSuggested(suggestion)}
                disabled={isAsking}
                className="rounded-sm border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-bold text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white disabled:opacity-50"
              >
                {suggestion}
              </button>
            ))}
          </div>

          <form onSubmit={submitQuestion} className="flex flex-col gap-3 sm:flex-row">
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask a question about this repository..."
              className="min-h-11 flex-1 rounded-sm border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition-colors focus:border-emerald-500/50"
            />
            <button
              type="submit"
              disabled={isAsking || question.trim().length === 0}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-sm bg-emerald-500 px-4 text-sm font-bold text-zinc-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
            >
              {isAsking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Ask
            </button>
          </form>

          {askError && (
            <div className="mt-4 rounded-sm border border-red-500/30 bg-red-500/10 p-4 text-sm font-medium text-red-300">
              The docs answer could not be loaded.
            </div>
          )}

          {answer && (
            <div className="mt-5 rounded-sm border border-emerald-500/20 bg-emerald-500/10 p-4">
              <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-100">{answer}</p>
              <p className="mt-3 border-t border-emerald-500/20 pt-3 text-xs font-bold uppercase tracking-wider text-emerald-300">
                Answer based on project docs
              </p>
            </div>
          )}
        </section>

        <section id="issues" className="scroll-mt-8 space-y-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Open issues</h2>
            <p className="text-sm font-medium text-zinc-500">Classified issues ready to explore.</p>
          </div>

          {project.openIssues.length > 0 ? (
            project.openIssues.map((issue) => <IssueCard key={issue.id} issue={issue} />)
          ) : (
            <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-8 text-center text-sm font-medium text-zinc-500">
              No classified open issues for this project yet.
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
