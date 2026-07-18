"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { ProjectDocsChatSheet } from "@/components/project/ProjectDocsChatSheet";
import { ProjectIssueCard } from "@/components/project/ProjectIssueCard";
import { IssueMix, ProjectHeader, ProjectIntelligence } from "@/components/project/ProjectOverview";
import type { IssueType, ProjectResponse } from "@/components/project/types";
import { ISSUE_META } from "@/components/project/project-utils";

async function fetchProject(projectId: string) {
  const response = await fetch(`/api/projects/${projectId}`);
  if (!response.ok) throw new Error("Failed to load project");
  return (await response.json()) as ProjectResponse;
}

export function ProjectDetailPage({ projectId }: { projectId: string }) {
  const [chatOpen, setChatOpen] = useState(false);

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
      <ProjectHeader project={project} onOpenChat={() => setChatOpen(true)} />
      <ProjectDocsChatSheet
        projectId={projectId}
        projectName={project.project.name}
        open={chatOpen}
        onOpenChange={setChatOpen}
      />

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <ProjectIntelligence project={project} />
        <IssueMix project={project} pieData={pieData} />
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
            <ProjectIssueCard key={issue.id} issue={issue} project={project.project} />
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
