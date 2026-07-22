export type Difficulty = "beginner" | "intermediate" | "advanced";
export type IssueType = "bug" | "feature" | "docs" | "refactor";

export type IssueDetailResponse = {
  issue: {
    id: string;
    title: string;
    body: string | null;
    labels: string[];
    state: "open" | "closed";
    assigneeCount: number;
    commentCount: number;
    githubUrl: string;
    aiSummary: string | null;
    difficulty: Difficulty | null;
    estimatedHours: number | null;
    requiredSkills: string[];
    issueType: IssueType | null;
    createdAt: string;
    updatedAt: string;
    repo: {
      id: string;
      owner: string;
      name: string;
      description: string | null;
      stars: number;
      maintainerScore: number;
      activityScore: number;
    };
  };
  match: {
    score: number;
    skillSim: number;
    interestSim: number;
    diffScore: number;
  } | null;
  similarIssues: Array<{
    id: string;
    title: string;
    aiSummary: string | null;
    difficulty: Difficulty | null;
    estimatedHours: number | null;
    issueType: IssueType | null;
    githubUrl: string;
    requiredSkills: string[];
    repo: {
      id: string;
      owner: string;
      name: string;
      maintainerScore: number;
    };
  }>;
  comments: Array<{
    id: number;
    body: string | null;
    createdAt: string;
    githubUrl: string;
    author: {
      login: string;
      avatarUrl: string;
      githubUrl: string;
    } | null;
  }>;
  workersCount: number;
  isWorking: boolean;
};
