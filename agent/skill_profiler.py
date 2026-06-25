# the skill profiler agent — the brain of contribiq
#
# takes raw github data, sends it to groq (llama-3.3-70b) for structured analysis,
# validates the output with pydantic, writes skills to postgres, and embeds them
# into pgvector using gemini for future cosine similarity matching.
#
# this is an async generator that yields SSE events at each stage so the frontend
# can show a live progress bar.

import os
import json
import logging
from typing import AsyncGenerator

import psycopg2
from groq import Groq
from google import genai
from pydantic import BaseModel, field_validator

from agent.github_client import get_github_data

logger = logging.getLogger("agent.skill_profiler")

# -- pydantic models to validate what groq returns --
# llama sometimes gets creative, so we validate before touching the db

class ParsedSkill(BaseModel):
    name: str
    level: str  # "strong" | "moderate" | "learning"
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


# the system prompt — tells groq exactly what shape we want back
SYSTEM_PROMPT = """You are a developer skill analyzer. Given a developer's GitHub activity data,
output ONLY a valid JSON array of skills. Each skill object must have these exact fields:
- name (string): the technology name, e.g. "React", "TypeScript", "Docker"
- level ("strong" | "moderate" | "learning"): based on repo count, commit volume, and recency
- confidence (number 0-1): how confident you are in this assessment
- repoCount (number): how many repos use this skill
- commitCount (number): estimated commits involving this skill

Rules:
- Output ONLY the JSON array. No markdown fences, no explanation, no commentary.
- Include 5-15 skills maximum. Focus on the most relevant ones.
- A developer with 5+ repos in a language and lots of merged PRs is "strong".
- 2-4 repos is "moderate". 1 repo or very low activity is "learning".
- If you see framework-level signals (e.g. Next.js config files, Docker files), include those too."""


def _get_db_connection():
    """grabs a fresh postgres connection using the same DATABASE_URL as next.js"""
    return psycopg2.connect(os.environ["DATABASE_URL"])


def _parse_skills(raw_text: str) -> list[ParsedSkill]:
    """
    tries to parse the llm output into validated skill objects.
    handles the case where the model wraps things in ```json blocks.
    """
    # first try: straight json parse
    try:
        data = json.loads(raw_text)
        return [ParsedSkill(**s) for s in data]
    except (json.JSONDecodeError, Exception):
        pass

    # second try: extract the json array from markdown fences
    import re
    match = re.search(r"\[[\s\S]*\]", raw_text)
    if match:
        try:
            data = json.loads(match.group(0))
            return [ParsedSkill(**s) for s in data]
        except (json.JSONDecodeError, Exception):
            pass

    raise ValueError(f"groq returned unparseable skill data: {raw_text[:200]}")


def _build_skill_summary(skills: list[ParsedSkill]) -> str:
    """
    turns structured skills into a readable sentence for the embedding model.
    grouping by level makes cosine similarity work better later.
    e.g. "Strong: React, TypeScript, Next.js. Moderate: Node.js. Learning: Rust."
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


async def run_skill_profiler(
    user_id: str, github_token: str
) -> AsyncGenerator[dict, None]:
    """
    the main pipeline — yields SSE-shaped dicts at each stage.
    next.js streams these directly to the browser.
    """

    # -- stage 1: fetch github data --
    yield {"step": "fetching", "message": "Reading your GitHub repositories…"}

    github_data = await get_github_data(user_id, github_token)

    yield {
        "step": "fetching",
        "message": f"Found {len(github_data['repos'])} repos and {github_data['merged_prs']} merged PRs",
    }

    # -- stage 2: ask groq to analyse --
    yield {
        "step": "analysing",
        "message": f"Analysing {github_data['total_commits']} commits across {len(github_data['repos'])} repos…",
    }

    groq_client = Groq(api_key=os.environ["GROQ_API_KEY"])

    response = groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"Here is the developer's GitHub activity data:\n\n{json.dumps(dict(github_data), indent=2)}",
            },
        ],
        temperature=0.2,  # keep it deterministic for structured output
        max_tokens=2048,
    )

    raw_text = response.choices[0].message.content or ""
    skills = _parse_skills(raw_text)

    # -- stage 3: write to postgres --
    yield {"step": "writing", "message": f"Saving {len(skills)} skills to your profile…"}

    conn = _get_db_connection()
    cur = conn.cursor()

    try:
        # find or create the skill profile for this user
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
                INSERT INTO skills (id, "skillProfileId", name, level, confidence, "repoCount", "commitCount", "createdAt", "updatedAt")
                VALUES (gen_random_uuid()::text, %s, %s, %s, %s, %s, %s, now(), now())
                ON CONFLICT ("skillProfileId", name) DO UPDATE SET
                    level = EXCLUDED.level,
                    confidence = EXCLUDED.confidence,
                    "repoCount" = EXCLUDED."repoCount",
                    "commitCount" = EXCLUDED."commitCount",
                    "updatedAt" = now()
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

        # use gemini for embeddings (768-dim, same as the pgvector column)
        genai_client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
        embed_response = genai_client.models.embed_content(
            model="gemini-embedding-001",
            contents=summary_text,
            config={"output_dimensionality": 768},
        )
        vector = embed_response.embeddings[0].values

        # upsert the embedding — raw sql because pgvector needs the ::vector cast
        cur.execute(
            """
            INSERT INTO skill_embeddings (skill_profile_id, embedding, updated_at)
            VALUES (%s, %s::vector, now())
            ON CONFLICT (skill_profile_id) DO UPDATE SET
                embedding = EXCLUDED.embedding,
                updated_at = now()
            """,
            (skill_profile_id, json.dumps(vector)),
        )

        # save a snapshot for historical tracking
        cur.execute(
            """
            INSERT INTO skill_snapshots (id, "userId", snapshot, "takenAt")
            VALUES (gen_random_uuid()::text, %s, %s::jsonb, now())
            """,
            (user_id, json.dumps([s.model_dump() for s in skills])),
        )

        # mark the user as onboarded
        cur.execute(
            """UPDATE users SET onboarded = true WHERE id = %s""",
            (user_id,),
        )

        conn.commit()

    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()

    yield {
        "step": "done",
        "message": f"Profile ready — {len(skills)} skills identified!",
    }
