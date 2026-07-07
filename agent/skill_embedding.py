import json
import os
from pathlib import Path
from typing import Any

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from google import genai

from agent.skill_canonical import format_skill_embedding_text

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_DIMENSIONS = 768


def database_url() -> str:
    value = os.getenv("DATABASE_URL")
    if not value:
        raise RuntimeError("DATABASE_URL is required")
    return value


def gemini_client() -> genai.Client:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is required")
    return genai.Client(api_key=api_key)


def vector_literal(values: list[float]) -> str:
    return json.dumps(values)


def embed_skill_profile(client: genai.Client, skills: list[dict[str, Any]]) -> list[float]:
    response = client.models.embed_content(
        model=EMBEDDING_MODEL,
        contents=format_skill_embedding_text(skills),
        config={"output_dimensionality": EMBEDDING_DIMENSIONS},
    )
    return response.embeddings[0].values


def refresh_skill_embedding(user_id: str) -> dict[str, Any]:
    embedder = gemini_client()
    with psycopg2.connect(database_url()) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT sp.id AS skill_profile_id
                FROM skill_profiles sp
                WHERE sp."userId" = %s
                """,
                (user_id,),
            )
            profile = cur.fetchone()
            if not profile:
                raise ValueError(f"Skill profile not found for user: {user_id}")

            cur.execute(
                """
                SELECT name, level, confidence, "repoCount", "commitCount"
                FROM skills
                WHERE "skillProfileId" = %s
                ORDER BY name ASC
                """,
                (profile["skill_profile_id"],),
            )
            skills = [dict(row) for row in cur.fetchall()]
            vector = vector_literal(embed_skill_profile(embedder, skills))
            cur.execute(
                """
                INSERT INTO skill_embeddings (skill_profile_id, embedding, updated_at)
                VALUES (%s, %s::vector, now())
                ON CONFLICT (skill_profile_id) DO UPDATE SET
                    embedding = EXCLUDED.embedding,
                    updated_at = now()
                """,
                (profile["skill_profile_id"], vector),
            )
        conn.commit()

    return {"userId": user_id, "skills": len(skills), "embeddingUpdated": True}
