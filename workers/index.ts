import "dotenv/config";

import { contributionSummaryWorker } from "./contribution-summary-worker";
import { issueClassificationWorker } from "./issue-classification-worker";
import { issueFetchWorker } from "./issue-fetch-worker";
import { repoDocsIngestWorker } from "./ingest-docs-worker";
import { registerSchedules } from "./scheduler";
import { matchScoringWorker } from "./match-scoring-worker";

registerSchedules()
  .then(() => {
    console.log(
      `[workers] running ${issueFetchWorker.name}, ${repoDocsIngestWorker.name}, ${issueClassificationWorker.name}, ${matchScoringWorker.name}, and ${contributionSummaryWorker.name}`
    );
  })
  .catch((error) => {
    console.error("[workers] failed to start", error);
    process.exitCode = 1;
  });
