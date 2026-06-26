# the skill profiler agent — the brain of contribiq
#
# takes raw github data (now including real dependency manifests),
# sends it to groq (llama-3.3-70b) for structured skill analysis,
# validates output with pydantic, writes to postgres, and embeds
# into pgvector using gemini for cosine similarity matching.
#
# KEY IMPROVEMENT: groq now receives actual dependencies (React, FastAPI, Prisma...)
# extracted from package.json / requirements.txt / Cargo.toml etc. per repo,
# not just the primary language. this means skills are evidence-based, not guessed.

import os
import json
import logging
from typing import AsyncGenerator

import psycopg2
import redis
from groq import Groq
from google import genai
from pydantic import BaseModel, field_validator

from agent.github_client import get_github_data

logger = logging.getLogger("agent.skill_profiler")


class ParsedSkill(BaseModel):
    name: str
    level: str       # "strong" | "moderate" | "learning"
    confidence: float
    repoCount: int
    commitCount: int

    @field_validator("level")
    @classmethod
    def validate_level(cls, v: str) -> str:
        if v not in ("strong", "moderate", "learning"):
            raise ValueError(f"level must be strong/moderate/learning, got {v}")
        return v

    @field_validator("confidence")
    @classmethod
    def validate_confidence(cls, v: float) -> float:
        return max(0.0, min(1.0, v))


SYSTEM_PROMPT = """You are a developer skill analyzer. Given a developer's GitHub activity,
output ONLY a valid JSON array of skills. Each skill object must have these exact fields:
- name (string): a specific technology, framework, or tool — NOT a language alone.
  Good examples: "React", "Next.js", "FastAPI", "Prisma", "Docker", "Tailwind CSS",
  "PostgreSQL", "LangChain", "PyTorch", "Flutter", "GraphQL", "Redis", "Gin".
  Bad examples: "TypeScript", "Python", "JavaScript" — these are languages, not skills.
  Exception: include a language ONLY if it appears as a standalone skill with no
  framework context (e.g. a developer who writes raw C or Go scripts).
- level ("strong" | "moderate" | "learning"): infer from how many repos use this
  dependency and how recently.
  strong   = appears in 4+ repos OR appears in 2+ repos with high star/fork counts
  moderate = appears in 2-3 repos
  learning = appears in 1 repo only
- confidence (number 0-1): how confident you are given the evidence.
  1.0 if the package name maps unambiguously to the skill (e.g. "next" → "Next.js").
  0.6-0.8 if inferred from context (e.g. "@supabase/supabase-js" → "Supabase").
  0.4-0.6 if the repo description hints at it but no direct package evidence.
- repoCount (number): how many repos contain this dependency.
- commitCount (number): rough estimate based on repoCount * average commits per repo.

Rules:
- Output ONLY the JSON array. No markdown fences, no explanation, no commentary.
- Include 8-20 skills. Cover frameworks, ORMs, databases, cloud tools, UI libraries, etc.
- Derive skills primarily from the dependencies[] arrays — those are ground truth.
- Use repo descriptions and topics as secondary signals to fill gaps.
- Normalise package names to proper skill names:
    "next" → "Next.js"
    "@prisma/client" or "prisma" → "Prisma"
    "tailwindcss" → "Tailwind CSS"
    "@supabase/supabase-js" or "@supabase/ssr" → "Supabase"
    "fastapi" → "FastAPI"
    "torch" or "pytorch" → "PyTorch"
    "tensorflow" → "TensorFlow"
    "langchain" or "langchain-core" → "LangChain"
    "bullmq" → "BullMQ"
    "ioredis" or "redis" → "Redis"
    "mongoose" → "MongoDB"
    "pg" or "postgres" or "psycopg2" → "PostgreSQL"
    "express" → "Express.js"
    "gin-gonic/gin" → "Gin"
    "axum" or "actix-web" → include as-is (Rust frameworks)
    "flutter_bloc" or "provider" → "Flutter"
    "django" → "Django"
    "flask" → "Flask"
- Do not include build tools, test runners, or linters as skills:
    skip: webpack, babel, jest, vitest, eslint, prettier, vite (as standalone),
          ts-node, nodemon, concurrently, dotenv, cross-env
- If two packages map to the same skill (e.g. both "pg" and "postgres"), merge them
  into one skill entry with the higher repoCount."""

SYSTEM_PROMPT += """

Important matching rule:
- Always include the developer's primary programming languages as skill entries
  alongside framework/tool skills. Include languages such as TypeScript,
  JavaScript, Python, Rust, Swift, Go, Java, Kotlin, C++, C#, Ruby, PHP, and Dart
  whenever the GitHub data shows meaningful usage. Do this even when framework
  context is also present, because issue requiredSkills often include raw
  language names and language-level matching is required."""


def _get_db_connection():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def _build_user_message(github_data: dict) -> str:
    """
    build a compact but information-dense message for groq.
    we summarise each repo as: name | language | deps | description
    so the context window doesn't get blown out on large dep lists.
    """
    lines = [
        f"Developer: {github_data['username']}",
        f"Total repos: {len(github_data['repos'])}",
        f"Merged PRs: {github_data['merged_prs']}",
        f"Language frequency: {json.dumps(github_data['languages'])}",
        "",
        "Repos (name | primary language | dependencies | description):",
    ]

    for repo in github_data["repos"]:
        deps = repo.get("dependencies", [])
        topics = repo.get("topics", [])
        dep_str = ", ".join(deps[:40]) if deps else "no manifest found"
        topic_str = ", ".join(topics) if topics else ""
        desc = repo.get("description") or ""

        line = f"  {repo['full_name']} | {repo.get('language') or 'unknown'} | [{dep_str}]"
        if desc:
            line += f" | {desc[:80]}"
        if topic_str:
            line += f" | topics: {topic_str}"
        lines.append(line)

    return "\n".join(lines)


def _parse_skills(raw_text: str) -> list[ParsedSkill]:
    """parse and validate groq's response, handling markdown fences."""
    try:
        data = json.loads(raw_text)
        return [ParsedSkill(**s) for s in data]
    except Exception:
        pass

    import re
    match = re.search(r"\[[\s\S]*\]", raw_text)
    if match:
        try:
            data = json.loads(match.group(0))
            return [ParsedSkill(**s) for s in data]
        except Exception:
            pass

    raise ValueError(f"groq returned unparseable skill data: {raw_text[:200]}")


def _build_skill_summary(skills: list[ParsedSkill]) -> str:
    """
    builds a readable sentence for the gemini embedding model.
    e.g. "Strong: React, Next.js, Prisma. Moderate: FastAPI. Learning: Flutter."
    grouping by level helps cosine similarity capture seniority signals.
    """
    grouped: dict[str, list[str]] = {"strong": [], "moderate": [], "learning": []}
    for skill in skills:
        grouped[skill.level].append(skill.name)

    parts = []
    if grouped["strong"]:
        parts.append(f"Strong: {', '.join(grouped['strong'])}")
    if grouped["moderate"]:
        parts.append(f"Moderate: {', '.join(grouped['moderate'])}")
    if grouped["learning"]:
        parts.append(f"Learning: {', '.join(grouped['learning'])}")

    return ". ".join(parts) + "."


def _score_matches_for_user(user_id: str) -> int:
    conn = _get_db_connection()
    cur = conn.cursor()

    try:
        cur.execute(
            """
            WITH user_vectors AS (
                SELECT
                    u.id AS user_id,
                    u.interests,
                    se.embedding AS skill_embedding,
                    COALESCE(AVG(s.confidence), 0.5) AS avg_confidence
                FROM users u
                JOIN skill_profiles sp ON sp."userId" = u.id
                JOIN skill_embeddings se ON se.skill_profile_id = sp.id
                LEFT JOIN skills s ON s."skillProfileId" = sp.id
                WHERE u.onboarded = true
                  AND u.id = %s
                GROUP BY u.id, u.interests, se.embedding
            ),
            scored AS (
                SELECT
                    uv.user_id,
                    ie.issue_id,
                    GREATEST(0, LEAST(1, 1 - (uv.skill_embedding <=> ie.embedding))) AS skill_sim,
                    CASE
                        WHEN COALESCE(array_length(uv.interests, 1), 0) = 0
                          OR COALESCE(array_length(r.categories, 1), 0) = 0
                        THEN 0
                        ELSE LEAST(
                            1,
                            (
                                SELECT COUNT(*)::float
                                FROM unnest(uv.interests) AS user_interest
                                JOIN unnest(r.categories) AS repo_category
                                  ON lower(user_interest) = lower(repo_category)
                                  OR (
                                      lower(user_interest) = 'ai_ml'
                                      AND lower(repo_category) IN ('ai', 'ml', 'ai/ml', 'machine-learning', 'machine learning')
                                  )
                            ) / GREATEST(array_length(uv.interests, 1), 1)
                        )
                    END AS interest_sim,
                    CASE
                        WHEN uv.avg_confidence >= 0.75 THEN
                            CASE i.difficulty
                                WHEN 'advanced'::"Difficulty" THEN 1.0
                                WHEN 'intermediate'::"Difficulty" THEN 0.85
                                ELSE 0.65
                            END
                        WHEN uv.avg_confidence >= 0.45 THEN
                            CASE i.difficulty
                                WHEN 'intermediate'::"Difficulty" THEN 1.0
                                WHEN 'beginner'::"Difficulty" THEN 0.85
                                ELSE 0.65
                            END
                        ELSE
                            CASE i.difficulty
                                WHEN 'beginner'::"Difficulty" THEN 1.0
                                WHEN 'intermediate'::"Difficulty" THEN 0.75
                                ELSE 0.45
                            END
                    END AS diff_score
                FROM user_vectors uv
                CROSS JOIN issue_embeddings ie
                JOIN issues i ON i.id = ie.issue_id
                JOIN repos r ON r.id = i."repoId"
                WHERE i.classified = true
                  AND i.state = 'open'::"IssueState"
                  AND i.difficulty IS NOT NULL
            )
            INSERT INTO issue_matches (
                id, "userId", "issueId", score,
                "skillSim", "interestSim", "diffScore",
                "createdAt", "updatedAt"
            )
            SELECT
                gen_random_uuid()::text,
                user_id,
                issue_id,
                (skill_sim * 0.7) + (interest_sim * 0.2) + (diff_score * 0.1),
                skill_sim,
                interest_sim,
                diff_score,
                now(),
                now()
            FROM scored
            ON CONFLICT ("userId", "issueId")
            DO UPDATE SET
                score = EXCLUDED.score,
                "skillSim" = EXCLUDED."skillSim",
                "interestSim" = EXCLUDED."interestSim",
                "diffScore" = EXCLUDED."diffScore",
                "updatedAt" = now()
            """,
            (user_id,),
        )
        upserted = cur.rowcount
        conn.commit()
        return upserted
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


def _clear_feed_cache(user_id: str) -> None:
    redis_url = os.environ.get("REDIS_URL")
    if not redis_url:
        return

    client = redis.Redis.from_url(redis_url, decode_responses=True)
    try:
        keys = client.keys(f"feed:{user_id}:*")
        if keys:
            client.delete(*keys)
    finally:
        client.close()


async def run_skill_profiler(
    user_id: str, github_token: str
) -> AsyncGenerator[dict, None]:
    """
    full pipeline as an async generator — yields SSE events at each stage.
    next.js streams these directly to the browser via /api/onboarding/progress.
    """

    # -- stage 1: fetch github data (now includes dependency manifests) --
    yield {"step": "fetching", "message": "Reading your GitHub repositories…"}

    github_data = await get_github_data(user_id, github_token)

    repos_with_deps = sum(
        1 for r in github_data["repos"] if r.get("dependencies")
    )
    yield {
        "step": "fetching",
        "message": (
            f"Found {len(github_data['repos'])} repos, "
            f"{repos_with_deps} with dependency manifests, "
            f"{github_data['merged_prs']} merged PRs"
        ),
    }

    # -- stage 2: send to groq for skill analysis --
    yield {
        "step": "analysing",
        "message": f"Analysing dependencies across {len(github_data['repos'])} repos…",
    }

    groq_client = Groq(api_key=os.environ["GROQ_API_KEY"])

    response = groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": _build_user_message(dict(github_data))},
        ],
        temperature=0.1,   # lower = more deterministic skill extraction
        max_tokens=2048,
    )

    raw_text = response.choices[0].message.content or ""
    skills = _parse_skills(raw_text)

    yield {
        "step": "analysing",
        "message": f"Identified {len(skills)} skills from your dependency history",
    }

    # -- stage 3: write skills to postgres --
    yield {"step": "writing", "message": f"Saving {len(skills)} skills to your profile…"}

    conn = _get_db_connection()
    cur = conn.cursor()

    try:
        # upsert skill_profile
        cur.execute(
            """
            INSERT INTO skill_profiles (id, "userId", "updatedAt")
            VALUES (gen_random_uuid()::text, %s, now())
            ON CONFLICT ("userId") DO UPDATE SET "updatedAt" = now()
            RETURNING id
            """,
            (user_id,),
        )
        skill_profile_id = cur.fetchone()[0]

        # upsert each skill
        for skill in skills:
            cur.execute(
                """
                INSERT INTO skills (
                    id, "skillProfileId", name, level, confidence,
                    "repoCount", "commitCount", "createdAt", "updatedAt"
                )
                VALUES (gen_random_uuid()::text, %s, %s, %s, %s, %s, %s, now(), now())
                ON CONFLICT ("skillProfileId", name) DO UPDATE SET
                    level        = EXCLUDED.level,
                    confidence   = EXCLUDED.confidence,
                    "repoCount"  = EXCLUDED."repoCount",
                    "commitCount"= EXCLUDED."commitCount",
                    "updatedAt"  = now()
                """,
                (
                    skill_profile_id,
                    skill.name,
                    skill.level,
                    skill.confidence,
                    skill.repoCount,
                    skill.commitCount,
                ),
            )

        # -- stage 4: embed into pgvector --
        yield {"step": "embedding", "message": "Building your skill fingerprint…"}

        summary_text = _build_skill_summary(skills)
        logger.info(f"embedding summary: {summary_text}")

        genai_client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
        embed_response = genai_client.models.embed_content(
            model="gemini-embedding-001",
            contents=summary_text,
            config={"output_dimensionality": 768},
        )
        vector = embed_response.embeddings[0].values

        cur.execute(
            """
            INSERT INTO skill_embeddings (skill_profile_id, embedding, updated_at)
            VALUES (%s, %s::vector, now())
            ON CONFLICT (skill_profile_id) DO UPDATE SET
                embedding  = EXCLUDED.embedding,
                updated_at = now()
            """,
            (skill_profile_id, json.dumps(vector)),
        )

        # save a point-in-time snapshot for the skill timeline chart
        cur.execute(
            """
            INSERT INTO skill_snapshots (id, "userId", snapshot, "takenAt")
            VALUES (gen_random_uuid()::text, %s, %s::jsonb, now())
            """,
            (user_id, json.dumps([s.model_dump() for s in skills])),
        )

        cur.execute(
            "UPDATE users SET onboarded = true WHERE id = %s",
            (user_id,),
        )

        conn.commit()

    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()

    yield {"step": "embedding", "message": "Scoring your issue matches..."}
    matched_count = _score_matches_for_user(user_id)
    _clear_feed_cache(user_id)

    yield {
        "step": "done",
        "message": f"Profile ready - {len(skills)} skills identified and {matched_count} matches scored!",
        "summary": {
            "totalCommits": github_data["total_commits"],
            "totalRepos": len(github_data["repos"]),
            "mergedPRs": github_data["merged_prs"],
        },
    }
    return
