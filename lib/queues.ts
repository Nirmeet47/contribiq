// all background queues in one place
// actual worker logic lives in workers/ — these are just the queue handles used to enqueue jobs

import { Queue, type ConnectionOptions } from "bullmq";
import { redis } from "./redis";

const connection = redis as unknown as ConnectionOptions;

// cron triggers this every 6h to pull fresh issues from all curated repos
export const issueFetchQueue = new Queue("issue-fetch", { connection });

// picks up unclassified issues and sends them through claude
export const issueClassificationQueue = new Queue("issue-classification", {
  connection,
});

// runs pgvector cosine similarity and writes the scores to issue_matches
export const matchScoringQueue = new Queue("match-scoring", { connection });

// keeps README/CONTRIBUTING chunks fresh in repo_docs
export const repoDocsIngestQueue = new Queue("repo-docs-ingest", { connection });

// triggered by the github webhook when a PR is merged
export const contributionQueue = new Queue("contribution-summary", {
  connection,
});
