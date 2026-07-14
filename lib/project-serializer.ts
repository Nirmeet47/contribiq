export type ProjectSummarySource = {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  categories: string[];
  stars: number;
  language: string | null;
  maintainerScore: number;
  activityScore: number;
  lastFetchedAt?: Date | string | null;
  updatedAt?: Date | string;
  createdAt?: Date | string;
  _count?: {
    issues: number;
  };
};

export type ProjectDifficultyCounts = Record<string, number>;

export type ProjectSummary = {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  categories: string[];
  stars: number;
  language: string | null;
  maintainerScore: number;
  activityScore: number;
  healthScore: number;
  openIssueCount: number;
  classifiedIssueCount: number;
  lastFetchedAt?: Date | string | null;
  updatedAt?: Date | string;
  createdAt?: Date | string;
  difficultyCounts?: ProjectDifficultyCounts;
};

export function getProjectHealthScore(project: {
  maintainerScore: number;
  activityScore: number;
}) {
  return project.maintainerScore * 0.55 + project.activityScore * 0.45;
}

export function serializeProjectSummary(
  project: ProjectSummarySource,
  options: {
    openIssueCount?: number;
    classifiedIssueCount?: number;
    difficultyCounts?: ProjectDifficultyCounts;
  } = {}
): ProjectSummary {
  return {
    id: project.id,
    owner: project.owner,
    name: project.name,
    fullName: project.fullName,
    description: project.description,
    categories: project.categories,
    stars: project.stars,
    language: project.language,
    maintainerScore: project.maintainerScore,
    activityScore: project.activityScore,
    healthScore: getProjectHealthScore(project),
    openIssueCount: options.openIssueCount ?? project._count?.issues ?? 0,
    classifiedIssueCount: options.classifiedIssueCount ?? 0,
    lastFetchedAt: project.lastFetchedAt,
    updatedAt: project.updatedAt,
    createdAt: project.createdAt,
    difficultyCounts: options.difficultyCounts,
  };
}
