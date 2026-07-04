import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const issueFeedSelect = {
  id: true,
  title: true,
  aiSummary: true,
  difficulty: true,
  estimatedHours: true,
  issueType: true,
  githubUrl: true,
  requiredSkills: true,
  repo: {
    select: {
      id: true,
      owner: true,
      name: true,
      fullName: true,
      categories: true,
      maintainerScore: true,
      activityScore: true,
      language: true,
    },
  },
  bookmarks: {
    select: { userId: true },
  },
} satisfies Prisma.IssueSelect;

export type IssueFeedRecord = {
  id: string;
  title: string;
  aiSummary: string | null;
  difficulty: "beginner" | "intermediate" | "advanced" | null;
  estimatedHours: number | null;
  issueType: "bug" | "feature" | "docs" | "refactor" | null;
  githubUrl: string;
  requiredSkills: string[];
  repo: {
    id: string;
    owner: string;
    name: string;
    fullName: string;
    categories: string[];
    maintainerScore: number;
    activityScore: number;
    language: string | null;
  };
  bookmarks?: Array<{ userId: string }>;
};

export function serializeIssueForFeed(issue: IssueFeedRecord, userId?: string | null) {
  return {
    id: issue.id,
    title: issue.title,
    aiSummary: issue.aiSummary,
    difficulty: issue.difficulty,
    estimatedHours: issue.estimatedHours,
    issueType: issue.issueType,
    githubUrl: issue.githubUrl,
    requiredSkills: issue.requiredSkills,
    bookmarked: userId
      ? issue.bookmarks?.some((bookmark) => bookmark.userId === userId) ?? false
      : false,
    repo: issue.repo,
  };
}

export async function getOptionalDbUserId() {
  try {
    const { createClient } = await import("@/utils/supabase/server");
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const githubIdStr = user?.user_metadata?.provider_id;
    if (!githubIdStr) return null;

    const dbUser = await prisma.user.findUnique({
      where: { githubId: parseInt(githubIdStr, 10) },
      select: { id: true },
    });

    return dbUser?.id ?? null;
  } catch {
    return null;
  }
}
