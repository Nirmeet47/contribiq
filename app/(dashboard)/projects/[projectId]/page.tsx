"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  History,
  Clock,
  GitPullRequest,
  Loader2,
  Send,
  Star,
  ThumbsDown,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, use, useState } from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { apiJson } from "@/lib/api-client";

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
  project: {
    id: string;
    owner: string;
    name: string;
    description: string | null;
    stars: number;
    language: string | null;
    categories: string[];
    maintainerScore: number;
    activityScore: number;
    contributionFriendliness: number;
  };
  githubStats: {
    contributors: number;
    openPullRequests: number;
    lastCommitAt: string | null;
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

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M12 2C6.48 2 2 6.58 2 12.24c0 4.52 2.87 8.35 6.84 9.71.5.1.68-.22.68-.49 0-.24-.01-1.04-.01-1.89-2.78.62-3.37-1.22-3.37-1.22-.45-1.19-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.35 1.12 2.92.85.09-.66.35-1.12.63-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.35 9.35 0 0 1 12 6.95c.85 0 1.7.12 2.5.34 1.9-1.33 2.74-1.05 2.74-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.8 0 .27.18.59.69.49A10.07 10.07 0 0 0 22 12.24C22 6.58 17.52 2 12 2Z" />
    </svg>
  );
}

function formatRelativeTime(value: string | null) {
  if (!value) return "Unknown";

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return "Unknown";

  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSeconds < 60) return "Just now";

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

async function fetchProject(projectId: string) {
  const response = await fetch(`/api/projects/${projectId}`);
  if (!response.ok) throw new Error("Failed to load project");
  return (await response.json()) as ProjectResponse;
}

async function streamProjectAnswer(
  projectId: string,
  query: string,
  onToken: (token: string) => void
) {
  const response = await fetch(`/api/projects/${projectId}/ask`, {
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
      <div className="flex items-center justify-between text-sm font-medium">
        <span className="text-white">{label}</span>
        <span className="text-zinc-100">{width}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-sm bg-zinc-900">
        <div className="h-full rounded-sm bg-emerald-400" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function ProjectStat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Star;
}) {
  return (
    <div className="rounded-sm border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-zinc-300">{label}</p>
        <Icon className="h-4 w-4 text-zinc-300" />
      </div>
      <p className="text-lg font-semibold leading-none text-white">{value}</p>
    </div>
  );
}

function IssueMixTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: { name: string; value: number } }>;
}) {
  if (!active || !payload?.[0]?.payload) return null;

  const item = payload[0].payload;

  return (
    <div className="rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-medium text-white shadow-xl shadow-black/40">
      {item.value} {item.name}
      {item.value === 1 ? "" : "s"}
    </div>
  );
}

function issueReasons(issue: ProjectIssue, project: ProjectResponse["project"]) {
  const reasons = [];

  if (issue.requiredSkills.length > 0) {
    reasons.push(`Uses ${issue.requiredSkills.slice(0, 2).join(", ")}`);
  }
  if (project.language) {
    reasons.push(`${project.name} is primarily ${project.language}`);
  }
  if (issue.issueType) {
    reasons.push(`${titleCase(issue.issueType)} issue`);
  }
  if (issue.difficulty && issue.estimatedHours !== null) {
    reasons.push(`${titleCase(issue.difficulty)}, about ${issue.estimatedHours}h`);
  }

  return reasons.slice(0, 3);
}

function IssueCard({
  issue,
  project,
}: {
  issue: ProjectIssue;
  project: ProjectResponse["project"];
}) {
  const queryClient = useQueryClient();
  const reasons = issueReasons(issue, project);
  const [bookmarked, setBookmarked] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const bookmarkMutation = useMutation({
    mutationFn: async (nextBookmarked: boolean) => {
      await apiJson("/api/bookmarks", {
        method: nextBookmarked ? "POST" : "DELETE",
        body: { issueId: issue.id },
        fallbackMessage: "Failed to update bookmark",
      });
    },
    onMutate: (nextBookmarked) => {
      setBookmarked(nextBookmarked);
      return { previousBookmarked: bookmarked };
    },
    onError: (_error, _nextBookmarked, context) => {
      if (context) setBookmarked(context.previousBookmarked);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
    },
  });

  const workingMutation = useMutation({
    mutationFn: async () => {
      return apiJson<{ working: boolean }>(`/api/issues/${issue.id}/working`, {
        fallbackMessage: "Failed to update working status",
      });
    },
    onSuccess: (payload) => {
      setIsWorking(payload.working);
      queryClient.invalidateQueries({ queryKey: ["working"] });
    },
  });

  const feedbackMutation = useMutation({
    mutationFn: async () => {
      await apiJson("/api/feedback", {
        body: { issueId: issue.id, type: "not_interested" },
        fallbackMessage: "Failed to dismiss issue",
      });
    },
    onSuccess: () => {
      setDismissed(true);
      queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
  });

  if (dismissed) return null;

  return (
    <article className="rounded-sm border border-zinc-800 bg-zinc-950 p-5 transition-colors hover:border-zinc-700">
      <div className="mb-4 flex items-start gap-3">
        <div
          className="h-14 w-14 shrink-0 rounded-sm border border-zinc-800 bg-zinc-900 bg-cover bg-center"
          style={{ backgroundImage: `url(https://github.com/${project.owner}.png)` }}
          aria-label={`${project.owner} logo`}
        />
        <div className="min-w-0">
          <Link
            href={`/projects/${project.id}`}
            className="inline-flex h-8 items-center rounded-sm border border-zinc-800 bg-zinc-900 px-2.5 text-xs font-medium text-white hover:border-zinc-700"
          >
            {project.owner}
          </Link>
          <Link
            href={`/issues/${issue.id}`}
            className="mt-1 block text-base font-bold leading-6 text-zinc-100 hover:text-white"
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
          <span className="rounded-sm border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-xs font-medium text-sky-300">
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

      {reasons.length > 0 && (
        <div className="mb-5 rounded-sm border border-zinc-900 bg-zinc-900/40 p-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-400">
            Why this issue
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {reasons.map((reason) => (
              <span
                key={reason}
                className="rounded-sm border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-200"
              >
                {reason}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4 border-t border-zinc-900 pt-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-wrap gap-2">
          {issue.requiredSkills.slice(0, 5).map((skill) => (
            <span key={skill} className="inline-flex h-9 items-center rounded-sm bg-zinc-900 px-3 text-xs font-medium text-zinc-300">
              {skill}
            </span>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={`/issues/${issue.id}`}
            className="inline-flex h-9 items-center justify-center rounded-sm bg-emerald-500 px-4 text-sm font-bold text-zinc-950 transition-colors hover:bg-emerald-400"
          >
            View Issue
          </Link>
          <a
            href={issue.githubUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 w-9 items-center justify-center rounded-sm border border-zinc-800 bg-zinc-900 text-zinc-400 transition-colors hover:border-zinc-700 hover:text-white"
            aria-label="Open issue on GitHub"
            title="Open on GitHub"
          >
            <GitHubMark className="h-5 w-5" />
          </a>
          <button
            type="button"
            onClick={() => workingMutation.mutate()}
            disabled={workingMutation.isPending}
            className={`inline-flex h-9 w-9 items-center justify-center rounded-sm border transition-colors disabled:opacity-50 ${
              isWorking
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:border-emerald-400/50 hover:bg-emerald-500/15"
            }`}
            aria-label={isWorking ? "Clear working status" : "Start working on this"}
            title={isWorking ? "Clear working status" : "Start working on this"}
          >
            <CheckCircle2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => bookmarkMutation.mutate(!bookmarked)}
            disabled={bookmarkMutation.isPending}
            className="inline-flex h-9 w-9 items-center justify-center rounded-sm border border-zinc-800 bg-zinc-900 text-zinc-400 transition-colors hover:border-zinc-700 hover:text-white disabled:opacity-50"
            aria-label={bookmarked ? "Remove bookmark" : "Bookmark issue"}
            title={bookmarked ? "Remove bookmark" : "Bookmark"}
          >
            {bookmarked ? <BookmarkCheck className="h-4 w-4 text-emerald-400" /> : <Bookmark className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => feedbackMutation.mutate()}
            disabled={feedbackMutation.isPending}
            className="inline-flex h-9 w-9 items-center justify-center rounded-sm border border-zinc-800 bg-zinc-900 text-zinc-400 transition-colors hover:border-zinc-700 hover:text-white disabled:opacity-50"
            aria-label="Not interested"
            title="Not interested"
          >
            <ThumbsDown className="h-4 w-4" />
          </button>
        </div>
      </div>
    </article>
  );
}

export default function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [askError, setAskError] = useState(false);

  const projectQuery = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => fetchProject(projectId),
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
      await streamProjectAnswer(projectId, trimmed, (token) => {
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
      <section className="flex min-h-screen items-center justify-center text-zinc-50">
        <div className="flex items-center gap-3 text-sm font-medium text-zinc-400">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
          Loading project...
        </div>
      </section>
    );
  }

  if (projectQuery.isError || !project) {
    return (
      <section className="flex min-h-screen items-center justify-center p-6 text-zinc-50">
        <div className="rounded-sm border border-red-500/30 bg-red-500/10 p-5 text-sm font-medium text-red-300">
          Project could not be loaded.
        </div>
      </section>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-6 sm:px-8 lg:px-10">
        <header className="rounded-sm border border-zinc-800 bg-zinc-950 p-5 shadow-sm">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="flex min-w-0 gap-4">
              <div
                className="h-14 w-14 shrink-0 rounded-sm border border-zinc-800 bg-zinc-900 bg-cover bg-center"
                style={{ backgroundImage: `url(https://github.com/${project.project.owner}.png)` }}
                aria-label={`${project.project.owner} logo`}
              />
              <div className="min-w-0 max-w-3xl">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="inline-flex h-8 items-center justify-center rounded-sm border border-zinc-800 bg-zinc-900 px-2.5 text-xs font-medium text-white">
                    {project.project.owner}
                  </span>
                </div>
                <h1 className="text-2xl font-bold leading-tight tracking-tight text-white">
                  {project.project.name}
                </h1>
                <p className="mt-2 text-sm leading-6 text-zinc-300">
                  {project.project.description || "No project description available."}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <a
                href={`https://github.com/${project.project.owner}/${project.project.name}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 w-10 items-center justify-center rounded-sm border border-zinc-800 bg-zinc-900 text-white transition-colors hover:border-zinc-700 hover:bg-zinc-800"
                aria-label="Open repository on GitHub"
                title="Open on GitHub"
              >
                <GitHubMark className="h-5 w-5" />
              </a>
              <a
                href="#issues"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-sm bg-emerald-500 px-4 text-sm font-bold text-zinc-950 transition-colors hover:bg-emerald-400"
              >
                Explore Issues
                <ArrowDown className="h-4 w-4" />
              </a>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ProjectStat label="Stars" value={project.project.stars.toLocaleString()} icon={Star} />
            <ProjectStat label="Contributors" value={project.githubStats.contributors.toLocaleString()} icon={UsersRound} />
            <ProjectStat label="Open PRs" value={project.githubStats.openPullRequests.toLocaleString()} icon={GitPullRequest} />
            <ProjectStat label="Last commit" value={formatRelativeTime(project.githubStats.lastCommitAt)} icon={History} />
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-5">
            <h2 className="mb-5 text-lg font-semibold text-white">Project intelligence</h2>
            <div className="space-y-5">
              <MetricBar label="Activity" value={project.project.activityScore} />
              <MetricBar label="Responsiveness" value={project.project.maintainerScore} />
              <MetricBar
                label="Contribution Friendliness"
                value={project.project.contributionFriendliness}
              />
            </div>

            <div className="mt-6 border-t border-zinc-900 pt-5">
              <h3 className="mb-4 text-lg font-semibold text-white">Tech stack</h3>
              <div className="flex flex-wrap gap-2">
                {project.techStack.length > 0 ? (
                  project.techStack.map((skill) => (
                    <span key={skill} className="inline-flex h-8 items-center rounded-sm border border-zinc-800 bg-zinc-900 px-3 text-sm font-medium text-white">
                      {skill}
                    </span>
                  ))
                ) : (
                  <span className="text-sm font-medium text-zinc-300">No stack manifest found.</span>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-5">
            <h2 className="mb-4 text-lg font-semibold text-white">Issue mix</h2>
            <div className="relative h-56">
              <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center">
                <span className="text-2xl font-semibold leading-none text-white">
                  {Object.values(project.issueBreakdown).reduce((sum, value) => sum + value, 0)}
                </span>
                <span className="mt-1 text-xs font-medium uppercase tracking-widest text-zinc-300">
                  Open
                </span>
              </div>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip content={<IssueMixTooltip />} cursor={false} isAnimationActive={false} />
                  <Pie
                    data={pieData.length > 0 ? pieData : [{ type: "docs", name: "No issues", value: 1 }]}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={58}
                    outerRadius={86}
                    stroke="#09090b"
                    strokeWidth={4}
                    isAnimationActive={false}
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
                <div
                  key={type}
                  className="flex h-8 items-center justify-between rounded-sm border border-zinc-800 bg-zinc-900/40 px-3 text-sm font-medium text-white"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="h-4 w-1 rounded-full"
                      style={{ backgroundColor: meta.color }}
                    />
                    {meta.label}
                  </span>
                  <span className="text-sm font-medium text-white">{project.issueBreakdown[type]}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-sm border border-zinc-800 bg-zinc-950 p-5">
          <div className="mb-5 flex flex-col gap-2">
            <h2 className="text-lg font-semibold text-white">Ask the project docs</h2>
            <p className="text-sm font-medium text-zinc-300">Answers are retrieved from the indexed README and contributing docs.</p>
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
              placeholder="Ask a question about this project..."
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

        <section id="issues" className="scroll-mt-8 space-y-5 pt-8">
          <div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-3xl font-bold tracking-tight text-white">Open issues</h2>
                <p className="mt-2 text-sm font-medium text-zinc-300">Classified issues ready to explore.</p>
              </div>
              <span className="inline-flex h-9 w-fit items-center rounded-sm border border-zinc-800 bg-zinc-950 px-3 text-sm font-medium text-white">
                {project.openIssues.length} open
              </span>
            </div>
          </div>

          {project.openIssues.length > 0 ? (
            project.openIssues.map((issue) => (
              <IssueCard key={issue.id} issue={issue} project={project.project} />
            ))
          ) : (
            <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-8 text-center text-sm font-medium text-zinc-300">
              No classified open issues for this project yet.
            </div>
          )}
        </section>
    </div>
  );
}

