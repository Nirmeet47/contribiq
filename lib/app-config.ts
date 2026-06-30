function intFromEnv(name: string, fallback: number) {
  const value = process.env[name];
  if (!value) return fallback;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function floatFromEnv(name: string, fallback: number) {
  const value = process.env[name];
  if (!value) return fallback;

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export const appConfig = {
  // Feed/API pagination and cache behavior.
  feedPageSize: intFromEnv("FEED_PAGE_SIZE", 30),
  feedMinScore: Math.min(floatFromEnv("FEED_MIN_SCORE", 0.5), 1),
  feedSkillOnlyMinScore: Math.min(floatFromEnv("FEED_SKILL_ONLY_MIN_SCORE", 0.65), 1),
  similarIssuesLimit: intFromEnv("SIMILAR_ISSUES_LIMIT", 5),

  // GitHub issue sync pagination. Keep page size within GitHub GraphQL limits.
  issueFetchPageSize: Math.min(intFromEnv("ISSUE_FETCH_PAGE_SIZE", 50), 100),
  issueFetchMaxPagesPerRepo: intFromEnv("ISSUE_FETCH_MAX_PAGES_PER_REPO", 3),

  // Lazy feed issue-state validation fallback. Webhooks and periodic sync are primary.
  issueValidationStaleMs: intFromEnv("ISSUE_VALIDATION_STALE_MS", 3_600_000),
  maxStaleIssuesToValidate: intFromEnv("MAX_STALE_ISSUES_TO_VALIDATE", 5),
};

export const scoreConfig = {
  // Time fit is intentionally small: skill and interest remain the primary ranking signals.
  skillWeight: 0.65,
  interestWeight: 0.2,
  difficultyWeight: 0.1,
  timeFitWeight: 0.05,

  // Onboarding values are hours/week. Preferred issue size maps to a realistic single issue.
  lightTimeCommitmentMaxHours: 4,
  steadyTimeCommitmentMaxHours: 7,
  lightPreferredIssueHours: 4,
  steadyPreferredIssueHours: 8,
  highPreferredIssueHours: 16,
  missingEstimateTimeFitScore: 0.7,
  minimumTimeFitScore: 0.35,
};
