// run this in the supabase sql editor after enabling the vector extension
// and after prisma db push has created the rest of the tables
//
// prisma can't model vector(1536) columns natively so these two tables
// live outside the schema and get managed via raw sql

create extension if not exists vector;

-- one row per user, id matches skill_profiles.id
-- queried with cosine similarity against issue_embeddings during match scoring
create table if not exists skill_embeddings (
  id         text primary key,
  user_id    text not null,
  embedding  vector(1536),
  updated_at timestamptz not null default now()
);

create index if not exists skill_embeddings_embedding_idx
  on skill_embeddings
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- one row per issue, id matches issues.id
-- rebuilt whenever the classification agent updates an issue's required skills
create table if not exists issue_embeddings (
  id         text primary key,
  issue_id   text not null,
  embedding  vector(1536),
  updated_at timestamptz not null default now()
);

create index if not exists issue_embeddings_embedding_idx
  on issue_embeddings
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- how match scoring queries this:
--
-- select
--   ie.issue_id,
--   1 - (se.embedding <=> ie.embedding) as cosine_similarity
-- from skill_embeddings se
-- cross join issue_embeddings ie
-- where se.user_id = '<userId>'
-- order by cosine_similarity desc
-- limit 100;
