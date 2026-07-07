import "dotenv/config";

import { contributionSummaryWorker } from "./contribution-summary-worker";
import { registerSchedules } from "./scheduler";

registerSchedules()
  .then(() => {
    console.log(`[workers] running ${contributionSummaryWorker.name}`);
  })
  .catch((error) => {
    console.error("[workers] failed to start", error);
    process.exitCode = 1;
  });
