import "dotenv/config";

import { issueFetchQueue, matchScoringQueue } from "@/lib/queues";

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
  ]);

  console.log("[workers] issue fetch and match scoring schedules registered");
}
