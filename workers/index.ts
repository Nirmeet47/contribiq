import "dotenv/config";

import { issueClassificationWorker } from "./issue-classification-worker";
import { issueFetchWorker } from "./issue-fetch-worker";
import { registerSchedules } from "./scheduler";
import { matchScoringWorker } from "./match-scoring-worker";

registerSchedules()
  .then(() => {
    console.log(
      `[workers] running ${issueFetchWorker.name}, ${issueClassificationWorker.name}, and ${matchScoringWorker.name}`
    );
  })
  .catch((error) => {
    console.error("[workers] failed to start", error);
    process.exitCode = 1;
  });
