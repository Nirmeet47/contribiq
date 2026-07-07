import "dotenv/config";

import { matchScoringQueue } from "@/lib/queues";

export async function registerSchedules() {
  await Promise.all([
    matchScoringQueue.add(
      "score-matches",
      {},
      {
        jobId: "score-matches-cron",
        repeat: { pattern: "30 */6 * * *" },
      }
    ),
  ]);

  console.log("[workers] match scoring schedule registered");
}
