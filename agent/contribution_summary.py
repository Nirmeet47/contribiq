import json
import logging
import os
import re
import time
from pathlib import Path
from typing import Any

import httpx
import psycopg2
import psycopg2.extras
import redis
from dotenv import load_dotenv
from google import genai
from groq import Groq

from agent.github_token import decrypt_github_token, get_app_github_token
from agent.skill_canonical import canonicalize_skills, format_skill_embedding_text, skill_identity

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("contribution_summary")

GITHUB_API = "https://api.github.com"
GITHUB_API_VERSION = "2022-11-28"
GROQ_MODEL = os.getenv("CONTRIBUTION_SUMMARY_MODEL", "llama-3.3-70b-versatile")
EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_DIMENSIONS = 768

SYSTEM_PROMPT = (
    "You analyze merged GitHub PRs and extract contribution metadata. Return only strict JSON "
    "with keys: aiDescription (string), skillsDemonstrated (string array), complexity "
    "(integer 1-5), linesAdded (integer), linesRemoved (integer), filesChanged (integer). "
    "Use canonical skill display names when obvious, e.g. TypeScript, JavaScript, Node.js, "
    "Next.js, React, Tailwind CSS, tRPC, Prisma, Supabase, PostgreSQL, GraphQL, MongoDB, "
    "Redis, Docker, Kubernetes."
)

KNOWN_LANGUAGES = {
    "typescript",
    "javascript",
    "python",
    "rust",
    "go",
    "java",
    "kotlin",
    "swift",
    "c",
    "c++",
    "c#",
    "ruby",
    "php",
    "dart",
    "scala",
    "elixir",
    "haskell",
    "lua",
    "r",
    "julia",
    "zig",
    "nim",
    "ocaml",
    "clojure",
}


def int_from_env(name: str, fallback: int) -> int:
    raw = os.getenv(name)
    if not raw:
        return fallback
    try:
        value = int(raw)
        return value if value > 0 else fallback
    except ValueError:
        return fallback


def database_url() -> str:
    value = os.getenv("DATABASE_URL")
    if not value:
        raise RuntimeError("DATABASE_URL is required")
    return value


def groq_client() -> Groq:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("GROQ_API_KEY is required")
    return Groq(api_key=api_key)


def gemini_client() -> genai.Client:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is required")
    return genai.Client(api_key=api_key)


def github_headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
    }


def contribution_github_token(stored_user_token: str | None) -> str:
    try:
        user_token = decrypt_github_token(stored_user_token)
        if user_token:
            return user_token
    except Exception as exc:
        log.warning("could not decrypt user GitHub token: %s", exc)
    token = get_app_github_token()
    if not token:
        raise RuntimeError("No GitHub token available")
    return token


def fetch_pr_files(client: httpx.Client, owner: str, name: str, number: int) -> list[dict[str, Any]]:
    response = client.get(f"{GITHUB_API}/repos/{owner}/{name}/pulls/{number}/files")
    response.raise_for_status()
    return response.json()


def fetch_pr_body(client: httpx.Client, owner: str, name: str, number: int) -> str:
    response = client.get(f"{GITHUB_API}/repos/{owner}/{name}/pulls/{number}")
    response.raise_for_status()
    return response.json().get("body") or ""


def build_prompt(contribution: dict[str, Any], pr_body: str, diff_files: list[dict[str, Any]]) -> str:
    return json.dumps(
        {
            "title": contribution["prTitle"],
            "description": pr_body,
            "files": [
                {
                    "filename": item.get("filename"),
                    "additions": item.get("additions", 0),
                    "deletions": item.get("deletions", 0),
                    "patch": (item.get("patch") or "")[:500],
                }
                for item in diff_files
            ],
        }
    )


def parse_summary(raw: str) -> dict[str, Any]:
    match = re.search(r"\{[\s\S]*\}", raw)
    data = json.loads(match.group(0) if match else raw)
    if not isinstance(data.get("aiDescription"), str):
        raise ValueError("aiDescription must be a string")
    if not isinstance(data.get("skillsDemonstrated"), list):
        raise ValueError("skillsDemonstrated must be an array")
    if int(data.get("complexity", 0)) < 1 or int(data.get("complexity", 0)) > 5:
        raise ValueError("complexity must be 1-5")
    for key in ("linesAdded", "linesRemoved", "filesChanged"):
        if not isinstance(data.get(key), int):
            raise ValueError(f"{key} must be an integer")
    return data


def summarize_contribution(ai: Groq, contribution: dict[str, Any], pr_body: str, diff_files: list[dict[str, Any]]) -> dict[str, Any]:
    completion = ai.chat.completions.create(
        model=GROQ_MODEL,
        response_format={"type": "json_object"},
        temperature=0.1,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": build_prompt(contribution, pr_body, diff_files)},
        ],
    )
    return parse_summary(completion.choices[0].message.content or "")


def vector_literal(values: list[float]) -> str:
    return json.dumps(values)


def embed_skill_profile(client: genai.Client, skills: list[dict[str, Any]]) -> list[float]:
    response = client.models.embed_content(
        model=EMBEDDING_MODEL,
        contents=format_skill_embedding_text(skills),
        config={"output_dimensionality": EMBEDDING_DIMENSIONS},
    )
    return response.embeddings[0].values


def is_language_skill(name: str) -> bool:
    return name.strip().lower() in KNOWN_LANGUAGES


def fetch_contribution(conn, contribution_id: str) -> dict[str, Any] | None:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT c.*, u."githubToken", sp.id AS skill_profile_id
            FROM contributions c
            JOIN users u ON u.id = c."userId"
            LEFT JOIN skill_profiles sp ON sp."userId" = u.id
            WHERE c.id = %s
            """,
            (contribution_id,),
        )
        return cur.fetchone()


def fetch_pending_contributions(conn, limit: int) -> list[str]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id
            FROM contributions
            WHERE processed = false
            ORDER BY "createdAt" ASC
            LIMIT %s
            """,
            (limit,),
        )
        return [row[0] for row in cur.fetchall()]


def ensure_skill_profile(conn, user_id: str, existing_id: str | None) -> str:
    if existing_id:
        return existing_id
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO skill_profiles (id, "userId", "updatedAt")
            VALUES (gen_random_uuid()::text, %s, now())
            ON CONFLICT ("userId") DO UPDATE SET "updatedAt" = now()
            RETURNING id
            """,
            (user_id,),
        )
        return cur.fetchone()[0]


def update_contribution_and_skills(
    conn,
    embedder: genai.Client,
    contribution: dict[str, Any],
    summary: dict[str, Any],
) -> None:
    demonstrated = canonicalize_skills(
        [{"name": name, "level": "learning", "confidence": 0.4} for name in summary["skillsDemonstrated"]]
    )
    skill_profile_id = ensure_skill_profile(conn, contribution["userId"], contribution["skill_profile_id"])

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            UPDATE contributions SET
              "aiDescription" = %s,
              "skillsDemonstrated" = %s,
              complexity = %s,
              "linesAdded" = %s,
              "linesRemoved" = %s,
              "filesChanged" = %s,
              processed = true,
              "updatedAt" = now()
            WHERE id = %s
            """,
            (
                summary["aiDescription"],
                [skill.name for skill in demonstrated],
                int(summary["complexity"]),
                int(summary["linesAdded"]),
                int(summary["linesRemoved"]),
                int(summary["filesChanged"]),
                contribution["id"],
            ),
        )

        for skill in demonstrated:
            cur.execute(
                """
                INSERT INTO skills (
                  id, "skillProfileId", name, level, confidence, "isLanguage",
                  "repoCount", "commitCount", "createdAt", "updatedAt"
                )
                VALUES (
                  gen_random_uuid()::text, %s, %s, 'learning', 0.4, %s,
                  0, 0, now(), now()
                )
                ON CONFLICT ("skillProfileId", name) DO NOTHING
                """,
                (skill_profile_id, skill.name, is_language_skill(skill.name)),
            )

        cur.execute(
            """
            SELECT name, level, confidence, "repoCount", "commitCount"
            FROM skills
            WHERE "skillProfileId" = %s
            ORDER BY name ASC
            """,
            (skill_profile_id,),
        )
        all_skills = [dict(row) for row in cur.fetchall()]
        vector = vector_literal(embed_skill_profile(embedder, all_skills))

        cur.execute(
            """
            INSERT INTO skill_embeddings (skill_profile_id, embedding, updated_at)
            VALUES (%s, %s::vector, now())
            ON CONFLICT (skill_profile_id) DO UPDATE SET
                embedding = EXCLUDED.embedding,
                updated_at = now()
            """,
            (skill_profile_id, vector),
        )
        cur.execute(
            """
            INSERT INTO skill_snapshots (id, "userId", snapshot, "takenAt")
            VALUES (gen_random_uuid()::text, %s, %s::jsonb, now())
            """,
            (contribution["userId"], json.dumps(all_skills)),
        )


def invalidate_caches(user_id: str) -> None:
    redis_url = os.getenv("REDIS_URL")
    if not redis_url:
        return
    try:
        client = redis.from_url(redis_url)
        keys = [f"contributions:stats:{user_id}"]
        keys.extend(client.keys(f"profile:*:{user_id}:*"))
        keys.extend(client.keys(f"feed:{user_id}:*"))
        if keys:
            client.delete(*keys)
        client.close()
    except Exception as exc:
        log.warning("cache invalidation failed for %s: %s", user_id, exc)


def process_contribution(contribution_id: str) -> dict[str, Any]:
    ai = groq_client()
    embedder = gemini_client()
    with psycopg2.connect(database_url()) as conn:
        contribution = fetch_contribution(conn, contribution_id)
        if not contribution:
            raise ValueError(f"Contribution not found: {contribution_id}")
        token = contribution_github_token(contribution.get("githubToken"))
        with httpx.Client(headers=github_headers(token), timeout=30) as github:
            diff_files = fetch_pr_files(
                github,
                contribution["repoOwner"],
                contribution["repoName"],
                contribution["prNumber"],
            )
            pr_body = fetch_pr_body(
                github,
                contribution["repoOwner"],
                contribution["repoName"],
                contribution["prNumber"],
            )
        summary = summarize_contribution(ai, contribution, pr_body, diff_files)
        update_contribution_and_skills(conn, embedder, contribution, summary)
        conn.commit()
    invalidate_caches(contribution["userId"])
    result = {"contributionId": contribution_id, "processed": True}
    log.info("processed contribution: %s", result)
    return result


def process_pending_contributions(limit: int | None = None) -> dict[str, int]:
    max_items = limit or int_from_env("CONTRIBUTION_SUMMARY_LIMIT", 25)
    stats = {"found": 0, "processed": 0, "failed": 0}
    with psycopg2.connect(database_url()) as conn:
        ids = fetch_pending_contributions(conn, max_items)
    stats["found"] = len(ids)
    for contribution_id in ids:
        try:
            process_contribution(contribution_id)
            stats["processed"] += 1
        except Exception as exc:
            stats["failed"] += 1
            log.exception("failed to process contribution %s: %s", contribution_id, exc)
        time.sleep(0.5)
    log.info("pending contribution processing complete: %s", stats)
    return stats


def main() -> None:
    process_pending_contributions()


if __name__ == "__main__":
    main()
