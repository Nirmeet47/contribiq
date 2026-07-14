-- Feed and catalog read paths filter through issue relation tables from both
-- user-first and issue-first directions. These indexes keep dashboard queries
-- from leaning on sequential scans as the catalog grows.

CREATE INDEX IF NOT EXISTS "issue_matches_userId_score_idx"
  ON "issue_matches" ("userId", "score");

CREATE INDEX IF NOT EXISTS "issue_matches_issueId_idx"
  ON "issue_matches" ("issueId");

CREATE INDEX IF NOT EXISTS "issues_repoId_state_classified_idx"
  ON "issues" ("repoId", "state", "classified");

CREATE INDEX IF NOT EXISTS "issues_state_difficulty_issueType_idx"
  ON "issues" ("state", "difficulty", "issueType");

CREATE INDEX IF NOT EXISTS "issues_updatedAt_idx"
  ON "issues" ("updatedAt");

CREATE INDEX IF NOT EXISTS "repos_language_idx"
  ON "repos" ("language");

CREATE INDEX IF NOT EXISTS "repos_activityScore_idx"
  ON "repos" ("activityScore");

CREATE INDEX IF NOT EXISTS "repos_maintainerScore_idx"
  ON "repos" ("maintainerScore");

CREATE INDEX IF NOT EXISTS "repos_stars_idx"
  ON "repos" ("stars");

CREATE INDEX IF NOT EXISTS "bookmarks_issueId_userId_idx"
  ON "bookmarks" ("issueId", "userId");

CREATE INDEX IF NOT EXISTS "issue_feedback_issueId_userId_idx"
  ON "issue_feedback" ("issueId", "userId");

CREATE INDEX IF NOT EXISTS "working_on_issueId_userId_idx"
  ON "working_on" ("issueId", "userId");
