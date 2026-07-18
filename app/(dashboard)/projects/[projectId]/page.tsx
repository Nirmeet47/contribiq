"use client";

import { use } from "react";
import { ProjectDetailPage } from "@/components/project/ProjectDetailPage";

export default function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  return <ProjectDetailPage projectId={projectId} />;
}
