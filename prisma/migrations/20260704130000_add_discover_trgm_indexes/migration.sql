CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS issues_title_trgm_idx
    ON issues USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS issues_ai_summary_trgm_idx
    ON issues USING gin ("aiSummary" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS repos_name_trgm_idx
    ON repos USING gin (name gin_trgm_ops);
