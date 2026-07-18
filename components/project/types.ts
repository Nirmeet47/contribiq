export type Difficulty = "beginner" | "intermediate" | "advanced";
export type IssueType = "bug" | "feature" | "docs" | "refactor";

export type ProjectIssue = {
  id: string;
  title: string;
  aiSummary: string | null;
  difficulty: Difficulty | null;
  issueType: IssueType | null;
  estimatedHours: number | null;
  githubUrl: string;
  requiredSkills: string[];
};

export type ProjectResponse = {
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

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  transient?: boolean;
};
