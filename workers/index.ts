import "dotenv/config";

import { contributionSummaryWorker } from "./contribution-summary-worker";
import { registerSchedules } from "./scheduler";
import { matchScoringWorker } from "./match-scoring-worker";

registerSchedules()
  .then(() => {
    console.log(
      `[workers] running ${matchScoringWorker.name} and ${contributionSummaryWorker.name}`
    );
  })
  .catch((error) => {
    console.error("[workers] failed to start", error);
    process.exitCode = 1;
  });
