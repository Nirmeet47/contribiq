import "dotenv/config";

import { issueFetchQueue, matchScoringQueue, repoDocsIngestQueue } from "@/lib/queues";

export async function registerSchedules() {
  await Promise.all([
    issueFetchQueue.add(
      "fetch-open-issues",
      {},
      {
        jobId: "fetch-open-issues-cron",
        repeat: { pattern: "0 */6 * * *" },
      }
    ),
    matchScoringQueue.add(
      "score-matches",
      {},
      {
        jobId: "score-matches-cron",
        repeat: { pattern: "30 */6 * * *" },
      }
    ),
    repoDocsIngestQueue.add(
      "ingest-repo-docs",
      {},
      {
        jobId: "ingest-repo-docs-cron",
        repeat: { pattern: "0 */12 * * *" },
      }
    ),
  ]);

  console.log("[workers] issue fetch, repo docs ingest, and match scoring schedules registered");
}
