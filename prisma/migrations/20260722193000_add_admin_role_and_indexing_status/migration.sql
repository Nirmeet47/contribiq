CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

CREATE TYPE "IndexingStatus" AS ENUM ('NOT_INDEXED', 'PENDING', 'INDEXED', 'FAILED');

ALTER TABLE "users"
  ADD COLUMN "role" "Role" NOT NULL DEFAULT 'USER';

ALTER TABLE "repos"
  ADD COLUMN "indexingStatus" "IndexingStatus" NOT NULL DEFAULT 'NOT_INDEXED',
  ADD COLUMN "lastIndexedAt" TIMESTAMP(3),
  ADD COLUMN "indexingError" TEXT;

CREATE INDEX "repos_indexingStatus_idx" ON "repos"("indexingStatus");
