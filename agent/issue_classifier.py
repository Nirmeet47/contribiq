import json
import logging
import os
import re
import time
from pathlib import Path
from typing import Any

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from groq import Groq

from agent.issue_embeddings import (
    canonical_required_skills,
    embed_required_skills,
    gemini_client,
    vector_literal,
)

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("issue_classifier")

GROQ_MODEL = os.getenv("ISSUE_CLASSIFIER_MODEL", "llama-3.3-70b-versatile")

SYSTEM_PROMPT = """
You classify GitHub issues for open-source contributor matching.
Return only strict JSON. Do not include markdown, commentary, code fences, or extra keys.
The JSON object must contain:
- difficulty: one of "beginner", "intermediate", "advanced"
- estimatedHours: a number
- requiredSkills: an array of strings
- issueType: one of "bug", "feature", "docs", "refactor"
- aiSummary: a 2-3 sentence plain-English summary explaining what the issue is, what's broken or needed, and what kind of change would fix it
- requiredSkills must use canonical display names when obvious, e.g. TypeScript, JavaScript, Node.js, Next.js, React, Tailwind CSS, tRPC, Prisma, Supabase, PostgreSQL, GraphQL, MongoDB, Redis, Docker, Kubernetes
"""


def int_from_env(name: str, fallback: int) -> int:
    raw = os.getenv(name)
    if not raw:
        return fallback
    try:
        value = int(raw)
        return value if value > 0 else fallback
    except ValueError:
        return fallback


def float_from_env(name: str, fallback: float) -> float:
    raw = os.getenv(name)
    if not raw:
        return fallback
    try:
        value = float(raw)
        return value if value >= 0 else fallback
    except ValueError:
        return fallback


def groq_client() -> Groq:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("GROQ_API_KEY is required")
    return Groq(api_key=api_key)


def build_user_prompt(issue: dict[str, Any]) -> str:
    return json.dumps(
        {
            "title": issue["title"],
            "body": issue.get("body") or "",
            "labels": issue.get("labels") or [],
        }
    )


def parse_classification(raw: str) -> dict[str, Any]:
    match = re.search(r"\{[\s\S]*\}", raw)
    data = json.loads(match.group(0) if match else raw)
    if data.get("difficulty") not in ("beginner", "intermediate", "advanced"):
        raise ValueError("invalid difficulty")
    if data.get("issueType") not in ("bug", "feature", "docs", "refactor"):
        raise ValueError("invalid issueType")
    if not isinstance(data.get("requiredSkills"), list) or not data["requiredSkills"]:
        raise ValueError("requiredSkills must be a non-empty array")
    if not isinstance(data.get("estimatedHours"), (int, float)) or data["estimatedHours"] <= 0:
        raise ValueError("estimatedHours must be positive")
    if not isinstance(data.get("aiSummary"), str) or not data["aiSummary"].strip():
        raise ValueError("aiSummary must be a non-empty string")
    return data


def classify_issue(client: Groq, issue: dict[str, Any]) -> dict[str, Any] | None:
    raw = ""
    try:
        completion = client.chat.completions.create(
            model=GROQ_MODEL,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": build_user_prompt(issue)},
            ],
            temperature=0.1,
            max_tokens=500,
        )
        raw = completion.choices[0].message.content or ""
        return parse_classification(raw)
    except Exception as exc:
        log.warning("classification failed for %s: %s | raw=%s", issue.get("id"), exc, raw[:120])
        return None


def fetch_unclassified_issues(conn, limit: int) -> list[dict[str, Any]]:
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """
        SELECT i.id, i.title, i.body, i.labels
        FROM issues i
        WHERE i.classified = false
          AND i.state = 'open'
        ORDER BY i."updatedAt" DESC
        LIMIT %s
        """,
        (limit,),
    )
    rows = cur.fetchall()
    cur.close()
    return rows


def save_classification(conn, issue_id: str, classification: dict[str, Any], required_skills: list[str], vector: list[float] | None) -> None:
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE issues SET
            difficulty = %s,
            "estimatedHours" = %s,
            "requiredSkills" = %s,
            "issueType" = %s,
            "aiSummary" = %s,
            classified = true,
            "updatedAt" = now()
        WHERE id = %s
        """,
        (
            classification["difficulty"],
            float(classification["estimatedHours"]),
            required_skills,
            classification["issueType"],
            classification["aiSummary"],
            issue_id,
        ),
    )
    if vector:
        cur.execute(
            """
            INSERT INTO issue_embeddings (issue_id, embedding, updated_at)
            VALUES (%s, %s::vector, now())
            ON CONFLICT (issue_id) DO UPDATE SET
                embedding = EXCLUDED.embedding,
                updated_at = now()
            """,
            (issue_id, vector_literal(vector)),
        )
    cur.close()


def classify_unclassified_issues(limit: int | None = None) -> dict[str, int]:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is required")
    max_issues = limit or int_from_env("ISSUE_CLASSIFY_LIMIT", 100)
    groq_sleep = float_from_env("ISSUE_CLASSIFY_GROQ_SLEEP", 0.5)
    gemini_sleep = float_from_env("ISSUE_CLASSIFY_GEMINI_SLEEP", 0.1)
    stats = {"found": 0, "classified": 0, "failed": 0, "embedded": 0}
    ai = groq_client()
    embedder = gemini_client()
    with psycopg2.connect(database_url) as conn:
        issues = fetch_unclassified_issues(conn, max_issues)
        stats["found"] = len(issues)
        log.info("classifying %s unclassified issue(s)", len(issues))
        for index, issue in enumerate(issues, start=1):
            log.info("[%s/%s] %s", index, len(issues), issue["title"][:80])
            classification = classify_issue(ai, issue)
            if not classification:
                stats["failed"] += 1
                time.sleep(groq_sleep)
                continue
            required_skills = canonical_required_skills(classification["requiredSkills"])
            time.sleep(gemini_sleep)
            vector = embed_required_skills(embedder, required_skills)
            try:
                save_classification(conn, issue["id"], classification, required_skills, vector)
                conn.commit()
                stats["classified"] += 1
                if vector:
                    stats["embedded"] += 1
            except Exception as exc:
                conn.rollback()
                stats["failed"] += 1
                log.error("classification DB write failed for %s: %s", issue["id"], exc)
            time.sleep(groq_sleep)
    log.info("issue classification complete: %s", stats)
    return stats


def main() -> None:
    classify_unclassified_issues()


if __name__ == "__main__":
    main()
