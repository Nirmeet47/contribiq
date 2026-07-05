import "dotenv/config";

import { repoDocsIngestQueue } from "@/lib/queues";

async function main() {
  const repoId = process.argv[2];
  if (!repoId) {
    throw new Error("Usage: tsx scripts/enqueue-repo-doc-ingest.ts <repoId>");
  }

  await repoDocsIngestQueue.add(
    "ingest-repo-docs",
    { repoId },
    { jobId: `ingest-repo-docs-${repoId}` }
  );

  await repoDocsIngestQueue.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
