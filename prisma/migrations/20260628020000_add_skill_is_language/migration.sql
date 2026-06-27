ALTER TABLE skills ADD COLUMN IF NOT EXISTS "isLanguage" boolean NOT NULL DEFAULT false;

ALTER TABLE issue_matches ADD COLUMN IF NOT EXISTS "langPenalty" double precision NOT NULL DEFAULT 1;
