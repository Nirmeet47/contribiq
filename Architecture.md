# ContribIQ Architecture

This document explains how ContribIQ is assembled, where the main responsibilities live, and how data moves through the system.

## System Overview

ContribIQ has two runtime layers:

1. Next.js application
   - Serves the product UI.
   - Owns authenticated route handlers.
   - Reads and writes relational data through Prisma.
   - Proxies long-running or AI-heavy work to Python services.

2. Python AI services
   - Analyze GitHub profiles.
   - Discover repositories.
   - Fetch and classify issues.
   - Generate embeddings.
   - Score issue matches.
   - Process merged PR contributions.
   - Answer project documentation questions with RAG.

Shared infrastructure:

- Supabase Auth for GitHub OAuth and session management.
- PostgreSQL for core data.
- pgvector for similarity search.
- pg_trgm for search indexes.
- Redis for cached API payloads.
- GitHub API and webhooks for source-of-truth repository events.
- Groq for chat/classification/summarization.
- Gemini for 768-dimensional embeddings.

## Request Path

```text
Browser
  -> Next.js App Router page
  -> Next.js route handler in app/api
  -> Supabase session check
  -> Prisma/Postgres and Redis
  -> optional Python AI API
  -> JSON, text stream, or SSE response
```

The Next.js app is the browser-facing backend-for-frontend. Python services are internal workers/APIs that perform operations that are long-running, AI-heavy, or easier to express in the pipeline code.

## Next.js Layer

Important files:

- `app/layout.tsx`: root layout and React Query provider.
- `app/(dashboard)/layout.tsx`: authenticated dashboard shell with sidebar.
- `proxy.ts`: Next.js proxy that refreshes Supabase sessions and protects private routes.
- `app/api/**/route.ts`: API route handlers.
- `lib/prisma.ts`: Prisma client setup.
- `lib/redis.ts`: Redis client setup.
- `lib/auth-user.ts`: current authenticated app user helpers.
- `utils/supabase/*`: Supabase browser, server, and proxy clients.

The app uses the Next.js App Router. Route groups such as `app/(dashboard)` organize dashboard pages without adding `(dashboard)` to URLs.

## Frontend Features

Dashboard pages are mostly composed from `components/dashboard/*`:

- Dashboard home and stats
- Recommended issue feed
- Matches page
- Discover/search pages
- Projects catalog
- Project detail page with RAG Q&A
- Contributions page
- Bookmarks page
- Working-on page
- Profile and preferences surfaces
- Skill review/onboarding UI

Client-side server state is handled with TanStack React Query through `app/providers.tsx`.

## API Surface

Key route handlers:

- `/api/me`: current user data.
- `/api/feed`: personalized issue feed.
- `/api/skills`: user skill data.
- `/api/skill-snapshots`: historical skill snapshots.
- `/api/discover/search`: searchable issue/project discovery.
- `/api/discover/trending`: trending discovery data.
- `/api/discover/by-tech/[tag]`: technology-filtered discovery.
- `/api/projects`: project list.
- `/api/projects/directory`: catalog directory view.
- `/api/projects/trending`: trending projects.
- `/api/projects/[projectId]`: project detail payload.
- `/api/projects/[projectId]/ask`: authenticated proxy to Python project Q&A.
- `/api/issues/[issueId]`: issue detail payload.
- `/api/issues/[issueId]/working`: working-on toggle.
- `/api/bookmarks`: bookmark create/delete/list.
- `/api/feedback`: issue feedback such as not interested.
- `/api/working`: working-on list.
- `/api/contributions`: contribution list.
- `/api/contributions/stats`: contribution analytics.
- `/api/contributions/heatmap`: contribution heatmap.
- `/api/onboarding/progress`: SSE proxy to the Python profile agent.
- `/api/webhooks/github`: GitHub issue and merged PR webhook receiver.
- `/api/env-check`: environment and service health checks.

Most private route handlers resolve the Supabase user first, then look up the matching local `users` row by GitHub provider ID.

## Python Layer

The Python code lives in `agent/`.

Important entry points:

- `agent/main.py`: onboarding/profile FastAPI service, usually on port `8000`.
- `agent/api.py`: AI utility FastAPI service, usually on port `8001`.
- `agent/scheduler.py`: long-running periodic worker.

Pipeline modules:

- `repo_discovery.py`: finds active public repositories and maintains the `repos` catalog.
- `repo_docs_ingestion.py`: embeds README/CONTRIBUTING docs into `repo_docs`.
- `issue_fetcher.py`: fetches open GitHub issues.
- `issue_classifier.py`: classifies issues with AI and stores issue embeddings.
- `skill_profiler.py`: builds user skill profiles from GitHub activity.
- `skill_embedding.py`: embeds user skill profiles.
- `match_scoring.py`: scores issue-user matches.
- `contribution_summary.py`: summarizes merged PR contributions.
- `rag_service.py`: retrieves docs/issues/stats and answers project questions.

## Service Ports

Default local ports:

```text
3000  Next.js app
8000  agent/main.py onboarding SSE API
8001  agent/api.py project Q&A and utility AI API
```

Relevant environment variables:

```text
AGENT_URL=http://localhost:8000
AI_API_BASE_URL=http://127.0.0.1:8001
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Data Model

The Prisma schema is split across `prisma/schema/*.prisma`. Prisma 7 reads the folder through `prisma.config.ts`.

Main entities:

- `User`: local app user created from GitHub OAuth.
- `SkillProfile`: aggregate profile for a user.
- `Skill`: normalized skill rows with confidence and level.
- `SkillEmbedding`: pgvector embedding for the user's skill profile.
- `Repo`: discovered open-source project.
- `RepoDoc`: embedded documentation chunk for project Q&A.
- `Issue`: GitHub issue plus AI classification fields.
- `IssueEmbedding`: pgvector embedding for issue skill requirements.
- `IssueMatch`: ranked user-issue match record.
- `Bookmark`: issue saved by a user.
- `WorkingOn`: issue currently claimed by a user in the app.
- `IssueFeedback`: dismissed or disliked issue feedback.
- `Contribution`: merged PR contribution record and AI summary.
- `SkillSnapshot`: historical skill profile snapshot.

## Vector Storage

Vector fields use pgvector with 768 dimensions:

- `skill_embeddings.embedding`
- `issue_embeddings.embedding`
- `repo_docs.embedding`

Prisma models declare these fields as `Unsupported("vector(768)")`. That means normal relational reads can use Prisma, but vector reads/writes use raw SQL through:

- `prisma.$queryRaw` or `prisma.$executeRaw` in TypeScript.
- `psycopg2` in Python pipeline modules.

Cosine distance is computed with pgvector operators such as `<=>`.

## Matching Algorithm

`IssueMatch` is the materialized output of the matching job. The score is recomputed by `agent/match_scoring.py`.

Formula:

```text
score = (skillSim * langPenalty) * 0.65
      + interestSim * 0.20
      + diffScore * 0.10
      + timeFit * 0.05
```

Inputs:

- `skillSim`: cosine similarity between user skill embedding and issue embedding.
- `langPenalty`: keeps recommendations aligned with known languages.
- `interestSim`: compares user interests with repository categories.
- `diffScore`: favors accessible issue difficulty.
- `timeFit`: compares estimated issue hours with user weekly availability.

The feed reads `issue_matches` ordered by score, then filters out closed issues, dismissed issues, and issues already marked as working.

## Repository Discovery Flow

```text
agent.repo_discovery
  -> GitHub repository search by topic
  -> freshness/star/good-first-issue filters
  -> Groq category assignment
  -> maintainer/activity score calculation
  -> upsert repos
  -> prune inactive repos without user ties
```

Discovery can run manually with:

```bash
npm run repo:discover
```

or periodically through:

```bash
npm run ai:worker
```

## Issue Pipeline

```text
repos
  -> issue_fetcher syncs GitHub issues
  -> issues created as classified=false
  -> issue_classifier fills AI fields
  -> Gemini creates issue embeddings
  -> match_scoring writes issue_matches
  -> /api/feed serves ranked results
```

Manual commands:

```bash
npm run issues:fetch
npm run issues:classify
npm run matches:score
```

One-shot local runner:

```bash
python scripts/run_pipeline.py
```

## Onboarding Flow

```text
GitHub OAuth via Supabase
  -> local users row
  -> /api/onboarding/progress
  -> agent/main.py /agent/profile
  -> skill_profiler reads GitHub activity
  -> skills and skill_profiles are written
  -> skill_embedding writes pgvector row
  -> profileAnalyzed/onboarded state unlocks the dashboard feed
```

The onboarding route streams server-sent events so the UI can show progress.

## Project Q&A Flow

```text
Project page
  -> /api/projects/[projectId]/ask
  -> auth and project existence check
  -> agent/api.py /projects/{repo_id}/ask
  -> embed query with Gemini
  -> retrieve nearest repo_docs chunks
  -> collect open issues and repo stats
  -> answer with Groq
  -> stream plain text back to browser
```

This flow depends on `repo_docs` being populated by:

```bash
npm run repo:docs
```

## Contribution Flow

```text
GitHub pull_request webhook
  -> /api/webhooks/github
  -> HMAC signature verification
  -> local user lookup by GitHub user id
  -> upsert contributions row
  -> trigger Python contribution processor
  -> summarize PR diff and demonstrated skills
  -> invalidate contribution caches
```

Issue webhooks also update issue state and invalidate relevant feed/project caches.

## Caching Strategy

Redis caches expensive API responses and computed summaries.

Primary cache areas:

- Personalized feed payloads
- Project detail data
- Issue detail data
- Contribution stats

Cache helpers:

- `lib/cache.ts`
- `lib/feed-cache.ts`
- `lib/contribution-cache.ts`
- `lib/cache-constants.ts`

Invalidation happens after GitHub webhooks, feedback changes, contribution updates, and issue state validation.

## Security Boundaries

- Supabase manages browser sessions.
- `proxy.ts` blocks unauthenticated dashboard and API access.
- Public routes are intentionally limited to landing/login/auth callback/env check paths.
- GitHub webhook requests must pass `x-hub-signature-256` validation.
- User GitHub tokens are stored encrypted and decrypted only before agent calls.
- Service role keys and AI keys must stay server-side.
- Route handlers validate request payloads with Zod where needed.

## Database Performance

Migrations add indexes for common read paths:

- Feed ordering by `issue_matches.userId` and `score`.
- Issue filtering by repo, state, classified status, difficulty, type, and update time.
- Repository filtering by language, activity, maintainer score, and stars.
- Bookmark, feedback, and working-on lookup indexes.
- Trigram search indexes for issue titles, AI summaries, and repository names.
- pgvector ivfflat index for repository documentation embeddings.

## Operational Modes

Development:

```bash
npm run dev
uvicorn agent.main:app --reload --port 8000
npm run ai:api
```

Background refresh:

```bash
npm run ai:worker
```

Manual recovery:

```bash
python scripts/check_db.py
python scripts/debug_feed_state.py
python scripts/run_pipeline.py
```

Production:

- Run Next.js as the web app.
- Run `agent/main.py` for onboarding/profile generation.
- Run `agent/api.py` for project Q&A and AI utility endpoints.
- Run `agent/scheduler.py` as a worker.
- Keep Redis, Postgres, Supabase, GitHub, Groq, and Gemini credentials available to the relevant process.

## Failure Modes And Recovery

- Empty feed: run onboarding, then `npm run matches:score`; check `skill_embeddings` and `issue_matches`.
- No classified issues: run `npm run issues:fetch`, then `npm run issues:classify`.
- Project Q&A has no context: run `npm run repo:docs`.
- GitHub webhook ignored: verify webhook secret and event type.
- Agent connection errors: check `AGENT_URL`, `AI_API_BASE_URL`, and the Python service ports.
- Vector SQL errors: confirm pgvector extension and migrations were applied.
- Env problems: visit `/env-check` for concrete missing or invalid values.

## Design Principles

- Keep route handlers thin and focused on auth, validation, orchestration, and response shape.
- Keep AI-heavy and long-running work in Python pipeline modules.
- Use Prisma for typed relational queries.
- Use raw SQL only where vector operations require it.
- Cache expensive read paths, but invalidate aggressively when source data changes.
- Materialize issue matches so the dashboard feed is fast and predictable.
- Treat GitHub as the source of truth for repository, issue, and contribution events.
