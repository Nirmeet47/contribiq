import "dotenv/config";

import { issueFetchQueue } from "@/lib/queues";
import { issueClassificationWorker } from "./issue-classification-worker";
import { issueFetchWorker } from "./issue-fetch-worker";
import { matchScoringWorker } from "./match-scoring-worker";

export async function registerIssueFetchCron() {
  await issueFetchQueue.add(
    "fetch-open-issues",
    {},
    {
      jobId: "fetch-open-issues-cron",
      repeat: { every: 6 * 60 * 60 * 1000 },
    }
  );
}

registerIssueFetchCron()
  .then(() => {
    console.log("[workers] issue fetch cron registered");
    console.log(
      `[workers] running ${issueFetchWorker.name}, ${issueClassificationWorker.name}, and ${matchScoringWorker.name}`
    );
  })
  .catch((error) => {
    console.error("[workers] failed to start", error);
    process.exitCode = 1;
  });
