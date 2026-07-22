"use client";

import { ArrowDown, GitPullRequest, History, MessageSquare, Star, UsersRound } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Button } from "@/components/ui/button";
import type { IssueType, ProjectResponse } from "@/components/project/types";
import { GitHubMark, ISSUE_META, formatRelativeTime, percent } from "@/components/project/project-utils";

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

export function ProjectHeader({
  project,
  onOpenChat,
}: {
  project: ProjectResponse;
  onOpenChat: () => void;
}) {
  return (
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
          <Button type="button" variant="outline" onClick={onOpenChat} className="h-10">
            <MessageSquare className="h-4 w-4" />
            Ask the project docs
          </Button>
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
  );
}

export function ProjectIntelligence({ project }: { project: ProjectResponse }) {
  return (
    <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-5">
      <h2 className="mb-5 text-lg font-semibold text-white">Project intelligence</h2>
      <div className="space-y-5">
        <MetricBar label="Activity" value={project.project.activityScore} />
        <MetricBar label="Responsiveness" value={project.project.maintainerScore} />
        <MetricBar label="Contribution Friendliness" value={project.project.contributionFriendliness} />
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
  );
}

export function IssueMix({ project, pieData }: { project: ProjectResponse; pieData: Array<{ type: IssueType; name: string; value: number }> }) {
  const fallbackData = [{ type: "docs" as IssueType, name: "No issues", value: 1 }];
  const chartData = pieData.length > 0 ? pieData : fallbackData;

  return (
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
              data={chartData}
              dataKey="value"
              nameKey="name"
              innerRadius={58}
              outerRadius={86}
              stroke="#09090b"
              strokeWidth={4}
              isAnimationActive={false}
            >
              {chartData.map((item) => (
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
              <span className="h-4 w-1 rounded-full" style={{ backgroundColor: meta.color }} />
              {meta.label}
            </span>
            <span className="text-sm font-medium text-white">{project.issueBreakdown[type]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
