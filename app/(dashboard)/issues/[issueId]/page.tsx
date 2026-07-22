"use client";

import { use } from "react";
import { IssueDetailPage } from "@/components/issues/IssueDetailPage";

export default function IssuePage({
  params,
}: {
  params: Promise<{ issueId: string }>;
}) {
  const { issueId } = use(params);
  return <IssueDetailPage issueId={issueId} />;
}
