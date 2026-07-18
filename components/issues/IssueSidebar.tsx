"use client";

import { FolderGit2, Loader2 } from "lucide-react";
import type { UseMutationResult } from "@tanstack/react-query";
import type { IssueDetailResponse } from "@/components/issues/types";
import { percentage, scoreTone, titleCase } from "@/components/issues/issue-utils";

function ProgressRow({ label, value }: { label: string; value: number }) {
  const width = percentage(value);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider">
        <span className="text-zinc-500">{label}</span>
        <span className="text-zinc-300">{width}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-sm bg-zinc-800">
        <div className="h-full rounded-sm bg-emerald-400" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export function IssueSidebar({
  issue,
  match,
  similarIssues,
  workersCount,
  isWorking,
  workingMutation,
}: {
  issue: IssueDetailResponse["issue"];
  match: IssueDetailResponse["match"];
  similarIssues: IssueDetailResponse["similarIssues"];
  workersCount: number;
  isWorking: boolean;
  workingMutation: UseMutationResult<{ working: boolean }, Error, void, unknown>;
}) {
  const matchScore = match ? Math.round(match.score * 100) : 0;

  return (
    <aside className="space-y-6">
      <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-5">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-zinc-400">
          Match score
        </h2>
        <p className={`mb-5 text-5xl font-bold ${scoreTone(match?.score ?? 0)}`}>
          {match ? `${matchScore}%` : "N/A"}
        </p>
        {match ? (
          <div className="space-y-4">
            <ProgressRow label="Skill" value={match.skillSim} />
            <ProgressRow label="Interest" value={match.interestSim} />
            <ProgressRow label="Difficulty" value={match.diffScore} />
          </div>
        ) : (
          <p className="text-sm font-medium text-zinc-500">No match score found.</p>
        )}
      </div>

      <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-zinc-400">
          Similar Issues
        </h2>
        {similarIssues.length > 0 ? (
          <div className="space-y-3">
            {similarIssues.map((similarIssue) => (
              <a
                key={similarIssue.id}
                href={`/issues/${similarIssue.id}`}
                className="block rounded-sm border border-zinc-800 bg-zinc-900 p-3 transition-colors hover:border-zinc-700"
              >
                <div className="mb-2 flex flex-wrap gap-2">
                  {similarIssue.issueType && (
                    <span className="rounded-sm border border-zinc-800 bg-zinc-950 px-1.5 py-0.5 text-[10px] font-bold text-zinc-400">
                      {titleCase(similarIssue.issueType)}
                    </span>
                  )}
                  {similarIssue.difficulty && (
                    <span className="rounded-sm border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-bold text-sky-300">
                      {titleCase(similarIssue.difficulty)}
                    </span>
                  )}
                </div>
                <h3 className="line-clamp-2 text-sm font-bold leading-5 text-zinc-200">
                  {similarIssue.title}
                </h3>
                {similarIssue.aiSummary && (
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-500">
                    {similarIssue.aiSummary}
                  </p>
                )}
              </a>
            ))}
          </div>
        ) : (
          <p className="text-sm font-medium text-zinc-500">No similar issues found.</p>
        )}
      </div>

      <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-zinc-400">
          Required Skills
        </h2>
        <div className="flex flex-wrap gap-2">
          {issue.requiredSkills.map((skill) => (
            <span key={skill} className="rounded-sm border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs font-medium text-zinc-300">
              {skill}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-zinc-400">
          Maintainer
        </h2>
        <p className="mb-3 text-base font-bold text-zinc-100">
          {issue.repo.owner}/{issue.repo.name}
        </p>
        <div className="space-y-2 text-sm font-medium text-zinc-400">
          <p>Responsiveness: {percentage(issue.repo.maintainerScore)}/100</p>
          <p>Activity: {percentage(issue.repo.activityScore)}/100</p>
        </div>
        <a
          href={`/projects/${issue.repo.id}`}
          className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-sm bg-emerald-500 px-4 text-sm font-bold text-zinc-950 shadow-sm shadow-emerald-950/40 transition-colors hover:bg-emerald-400"
        >
          <FolderGit2 className="h-4 w-4" />
          View Project
        </a>
      </div>

      <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-5">
        <p className="mb-4 text-sm font-medium text-zinc-400">
          {workersCount} developer{workersCount === 1 ? "" : "s"} working on this
        </p>
        <button
          type="button"
          onClick={() => workingMutation.mutate()}
          disabled={workingMutation.isPending}
          className={`inline-flex w-full items-center justify-center gap-2 rounded-sm px-4 py-2 text-sm font-bold transition-colors disabled:opacity-60 ${
            isWorking
              ? "bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
              : "border border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700 hover:text-white"
          }`}
        >
          {workingMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {isWorking ? "Stop working on this" : "I'm working on this"}
        </button>
      </div>
    </aside>
  );
}
