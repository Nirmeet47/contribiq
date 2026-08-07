# ContribIQ

ContribIQ helps developers find open-source issues that actually match their skills, interests, and available time. After a user signs in with GitHub, the platform analyzes their public coding activity, builds a skill profile, compares that profile with classified GitHub issues, and recommends contribution opportunities with clear match scores.

The system is built as a full-stack AI product: a Next.js dashboard for the user experience, Python services for GitHub analysis and AI pipelines, Supabase for authentication, PostgreSQL with pgvector for relational and vector data, Redis for caching, GitHub webhooks for contribution tracking, Groq for classification and summaries, and Gemini for embeddings.

## What It Does

- GitHub OAuth login through Supabase.
- Developer onboarding with interest and weekly availability capture.
- GitHub profile analysis that creates skill profiles from repositories and commit history.
- Repository discovery for active public projects with good first issue potential.
- Issue ingestion from GitHub, followed by AI classification.
- Vector-based issue matching using user skill embeddings and issue embeddings.
- Personalized dashboard feed with filters for difficulty, issue type, and language.
- Bookmarks, dismissed issues, and "working on" tracking.
- Project catalog with activity, maintainer, tech stack, issue mix, and project Q&A.
- Contribution tracking from merged pull request webhooks.
- Environment diagnostics at `/env-check`.

## Tech Stack

- Framework: Next.js 16 App Router, React 19, TypeScript
- UI: Tailwind CSS 4, lucide-react, Recharts, local UI primitives
- Data: Prisma 7, PostgreSQL, pgvector, pg_trgm
- Auth: Supabase Auth with GitHub OAuth
- Cache/queues: Redis via ioredis
- AI service: Python, FastAPI, Groq, Gemini embeddings, LangChain fallback paths
- Integrations: GitHub REST API and GitHub webhooks

## Repository Layout

```text
app/                         Next.js App Router pages and route handlers
app/(dashboard)/             Authenticated dashboard route group
app/api/                     Backend-for-frontend API routes
components/dashboard/        Dashboard and product UI components
components/ui/               Shared UI primitives
lib/                         Server utilities, Prisma, cache, AI API clients
utils/supabase/              Supabase browser/server/proxy helpers
agent/                       Python AI API, scheduler, and pipeline modules
scripts/                     One-shot and debugging pipeline scripts
prisma/schema/               Prisma 7 split schema files
prisma/migrations/           Database migrations and indexes
public/                      Static assets
```

## Prerequisites

- Node.js compatible with Next.js 16
- npm
- Python 3.11 or newer
- PostgreSQL with `vector` and `pg_trgm` extensions enabled
- Redis
- Supabase project with GitHub OAuth configured
- GitHub OAuth app and webhook secret
- Groq API key
- Gemini API key

## Environment Variables

Create `.env` for the Python services and `.env.local` for the Next.js app, or use one local file if your tooling loads it consistently. The runtime expects these values:

```env
DATABASE_URL=
DIRECT_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_WEBHOOK_SECRET=
GITHUB_TOKEN=
GITHUB_PAT=
GITHUB_TOKEN_ENCRYPTION_KEY=
TOKEN_ENCRYPTION_KEY=
CONTRIBIQ_SERVICE_TOKEN=
REDIS_URL=
GROQ_API_KEY=
GEMINI_API_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
AI_API_BASE_URL=http://127.0.0.1:8001
```

Notes:

- `GITHUB_TOKEN` or `GITHUB_PAT` is used for app-level GitHub API calls.
- `GITHUB_TOKEN_ENCRYPTION_KEY` or `TOKEN_ENCRYPTION_KEY` protects stored user GitHub tokens.
- `CONTRIBIQ_SERVICE_TOKEN` optionally protects calls from Next.js to the internal Python AI API. Set the same value for both runtimes.
- `AI_API_BASE_URL` points to the Python AI API in `agent/api.py`.
- `/env-check` and `/api/env-check` validate the most important services and keys.

## Installation

Install JavaScript dependencies:

```bash
npm install
```

Create and activate a Python virtual environment:

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r agent/requirements.txt
```

Apply database migrations:

```bash
npx prisma migrate dev
```

Generate the Prisma client:

```bash
npx prisma generate
```

## Running Locally

Start the Next.js app:

```bash
npm run dev
```

Start the Python AI API:

```bash
npm run ai:api
```

Optional: start the scheduled worker that keeps repositories, issues, matches, docs, and contributions fresh:

```bash
npm run ai:worker
```

Open the app at:

```text
http://localhost:3000
```

## Useful Commands

```bash
npm run dev                    # Next.js development server
npm run build                  # Production build
npm run start                  # Start built Next.js app
npm run lint                   # ESLint
npm run ai:api                 # FastAPI service on port 8001
npm run ai:worker              # Python scheduler
npm run repo:discover          # Discover and refresh repository catalog
npm run repo:docs              # Ingest README/CONTRIBUTING docs into pgvector
npm run issues:fetch           # Fetch GitHub issues
npm run issues:classify        # Classify unclassified issues
npm run matches:score          # Recompute issue matches
npm run contributions:process  # Process queued merged PR summaries
python scripts/run_pipeline.py # Fetch, classify, embed, and score in one shot
python scripts/check_db.py     # Print database health counts and samples
```

## Core Workflows

### Onboarding

1. A user signs in with GitHub through Supabase.
2. The app creates or updates the local `users` row.
3. The onboarding progress route streams events from `agent/api.py`.
4. The Python profiler fetches GitHub data, creates skills, and refreshes the user skill embedding.
5. The user becomes eligible for personalized issue matches.

### Issue Matching

1. Repository discovery populates `repos`.
2. Issue fetching populates raw `issues`.
3. Classification fills `aiSummary`, `difficulty`, `estimatedHours`, `requiredSkills`, and `issueType`.
4. Gemini embeddings are stored in `issue_embeddings`.
5. Match scoring compares issue vectors with user skill vectors and writes `issue_matches`.
6. `/api/feed` serves ranked matches with Redis caching.

### Project Q&A

1. Repository docs are chunked and embedded into `repo_docs`.
2. The project page posts questions to `/api/projects/[projectId]/ask`.
3. Next.js verifies auth and forwards to the Python AI API.
4. The Python RAG service retrieves relevant doc chunks and project issue context.
5. Groq produces an answer grounded in indexed docs, open issues, and repo stats.

### Contribution Tracking

1. GitHub sends merged pull request webhooks to `/api/webhooks/github`.
2. The route verifies the HMAC signature.
3. A `contributions` queue row is upserted.
4. The Python contribution processor reads the PR diff and fills AI summary fields.
5. Contribution stats caches are invalidated.

## Database Notes

The Prisma schema is split across `prisma/schema/*.prisma`. Prisma config lives in `prisma.config.ts`, and the datasource URL is loaded from `DATABASE_URL`.

Vector columns use `Unsupported("vector(768)")`, so reads and writes involving embeddings use raw SQL through Prisma or Python database clients. Normal relational data uses Prisma models.

### What Is Stored In Each Table

| Table | Basic data stored | Used for |
| --- | --- | --- |
| `users` | GitHub identity, username, display profile, encrypted GitHub token, selected interests, weekly time commitment, role, onboarding flags | Authentication mapping, onboarding state, personalized matching |
| `skill_profiles` | One aggregate skill profile per user, including total commits, repositories, merged PR counts, and last update time | Profile overview and matching context |
| `skills` | Individual skills for a profile, including name, level, confidence, language flag, repo count, and commit count | Skill radar, profile review, match explanations |
| `skill_embeddings` | 768-dimensional vector representation of a user's skill profile | Similarity scoring against issue embeddings |
| `skill_snapshots` | JSON snapshots of a user's skill profile over time | Skill history and timeline views |
| `repos` | Discovered repository metadata, owner/name, description, categories, stars, language, maintainer score, activity score, and indexing status | Project catalog, issue ingestion, interest matching |
| `repo_docs` | Embedded documentation chunks from repository files, including file path, chunk text, content hash, and vector embedding | Project Q&A and retrieval-augmented answers |
| `issues` | GitHub issue title/body, labels, state, assignee/comment counts, URL, classification status, AI summary, difficulty, estimated hours, required skills, and issue type | Issue detail pages, feed cards, discovery, matching inputs |
| `issue_embeddings` | 768-dimensional vector representation of an issue's skill requirements and context | Similarity scoring against user skill embeddings |
| `issue_matches` | One user-issue match row with final score, skill similarity, language penalty, interest similarity, and difficulty score | Ranked personalized feed |
| `bookmarks` | Issues saved by a user | Saved issue list and quick return workflow |
| `working_on` | Issues a user has marked as actively working on | Working-on dashboard and feed filtering |
| `issue_feedback` | User feedback such as `not_interested` for an issue | Hiding dismissed issues from future recommendations |
| `contributions` | Merged PR webhook records, PR metadata, processing status, AI contribution summary, demonstrated skills, complexity, and diff stats | Contribution history, profile updates, activity analytics |

## Caching

Redis is used for feed, project, issue, and contribution stats caches. Cache helper functions live in `lib/cache.ts`, with TTL constants in `lib/cache-constants.ts` and feed-specific invalidation in `lib/feed-cache.ts`.

Webhook events and lazy issue-state validation invalidate stale issue, project, and feed data.

## Deployment Notes

- Deploy the Next.js app with all required environment variables.
- Run the Python services separately from the Next.js process.
- Ensure Postgres has `vector` and `pg_trgm` extensions.
- Configure Supabase GitHub OAuth redirect URLs for the deployed origin.
- Configure GitHub webhooks to call `/api/webhooks/github` with the same `GITHUB_WEBHOOK_SECRET`.
- Run `npm run ai:worker` as a long-lived worker process or scheduled job.

## Documentation

See [Architecture.md](./Architecture.md) for system design, data flow, service boundaries, and operational notes.
