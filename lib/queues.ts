// all background queues in one place
// actual worker logic lives in workers/ — these are just the queue handles used to enqueue jobs

import { Queue, type ConnectionOptions } from "bullmq";
import { redis } from "./redis";

const connection = redis as unknown as ConnectionOptions;

// runs pgvector cosine similarity and writes the scores to issue_matches
export const matchScoringQueue = new Queue("match-scoring", { connection });

// triggered by the github webhook when a PR is merged
export const contributionQueue = new Queue("contribution-summary", {
  connection,
});
