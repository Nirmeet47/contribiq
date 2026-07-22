"use client";

import { Clock, ExternalLink, GitPullRequest, MessageSquare, Tag, Users } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { IssueDetailResponse } from "@/components/issues/types";
import { formatDate, titleCase } from "@/components/issues/issue-utils";

export function IssueMainContent({
  issue,
  comments,
}: {
  issue: IssueDetailResponse["issue"];
  comments: IssueDetailResponse["comments"];
}) {
  return (
    <section className="space-y-6 lg:col-span-2">
      <div className="rounded-sm border border-emerald-800 bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-emerald-300">
          AI Summary
        </h2>
        <p className="text-sm leading-6 text-zinc-200">
          {issue.aiSummary || "No AI summary available yet."}
        </p>
      </div>

      <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-5">
        <div className="mb-5 flex flex-wrap gap-2">
          {issue.labels.map((label) => (
            <span key={label} className="inline-flex items-center gap-1 rounded-sm border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs font-medium text-zinc-300">
              <Tag className="h-3 w-3" />
              {label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1 rounded-sm border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs font-medium text-zinc-300">
            <Users className="h-3 w-3" />
            {issue.assigneeCount} assignees
          </span>
          <span className="inline-flex items-center gap-1 rounded-sm border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs font-medium text-zinc-300">
            <MessageSquare className="h-3 w-3" />
            {issue.commentCount} comment{issue.commentCount === 1 ? "" : "s"}
          </span>
          {issue.issueType && (
            <span className="inline-flex items-center gap-1 rounded-sm border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs font-medium text-zinc-300">
              <GitPullRequest className="h-3 w-3" />
              {titleCase(issue.issueType)}
            </span>
          )}
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
        </div>

        <div className="prose prose-invert prose-sm max-w-none rounded-sm border border-zinc-900 bg-zinc-950 p-4 text-sm leading-6 text-zinc-300">
          <ReactMarkdown>{issue.body || "No issue body provided."}</ReactMarkdown>
        </div>

        <a
          href={issue.githubUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-5 inline-flex items-center gap-2 rounded-sm bg-emerald-500 px-4 py-2 text-sm font-bold text-zinc-950 transition-colors hover:bg-emerald-400"
        >
          <ExternalLink className="h-4 w-4" />
          View on GitHub
        </a>
      </div>

      <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-5">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
            Comments
          </h2>
          <a
            href={issue.githubUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-bold text-emerald-400 hover:text-emerald-300"
          >
            View all on GitHub
          </a>
        </div>

        {comments.length > 0 ? (
          <div className="space-y-3">
            {comments.map((comment) => (
              <article key={comment.id} className="rounded-sm border border-zinc-900 bg-zinc-900/60 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <a
                    href={comment.author?.githubUrl ?? comment.githubUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-bold text-zinc-200 hover:text-white"
                  >
                    {comment.author?.login ?? "GitHub user"}
                  </a>
                  <span className="shrink-0 text-xs font-medium text-zinc-500">
                    {formatDate(comment.createdAt)}
                  </span>
                </div>
                <p className="line-clamp-6 whitespace-pre-wrap text-sm leading-6 text-zinc-400">
                  {comment.body || "No comment body provided."}
                </p>
                <a
                  href={comment.githubUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex text-xs font-bold text-emerald-400 hover:text-emerald-300"
                >
                  Open comment
                </a>
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm font-medium text-zinc-500">
            {issue.commentCount > 0
              ? "Recent comments are unavailable here right now."
              : "No comments yet."}
          </p>
        )}
      </div>
    </section>
  );
}
