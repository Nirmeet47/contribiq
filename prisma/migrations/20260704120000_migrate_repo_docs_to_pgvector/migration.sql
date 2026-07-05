-- Drop the old local FAISS index pointer from repos.
ALTER TABLE "repos" DROP COLUMN IF EXISTS "faissIndexPath";

CREATE EXTENSION IF NOT EXISTS vector;

-- Store repository documentation chunks directly in Postgres/pgvector.
CREATE TABLE "repo_docs" (
    "id" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "chunkText" TEXT NOT NULL,
    "embedding" vector(768) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repo_docs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "repo_docs_filePath_check" CHECK ("filePath" IN ('README.md', 'CONTRIBUTING.md'))
);

CREATE UNIQUE INDEX "repo_docs_repoId_filePath_chunkIndex_key"
    ON "repo_docs"("repoId", "filePath", "chunkIndex");

CREATE INDEX "repo_docs_repoId_filePath_idx"
    ON "repo_docs"("repoId", "filePath");

CREATE INDEX "repo_docs_repoId_embedding_idx"
    ON "repo_docs"
    USING ivfflat ("embedding" vector_cosine_ops)
    WITH (lists = 100);

ALTER TABLE "repo_docs"
    ADD CONSTRAINT "repo_docs_repoId_fkey"
    FOREIGN KEY ("repoId") REFERENCES "repos"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
