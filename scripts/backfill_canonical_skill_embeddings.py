import json
import os
import sys

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from google import genai

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from agent.skill_canonical import (
    canonicalize_skills,
    format_issue_embedding_text,
    format_skill_embedding_text,
)

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))


def vector_literal(values: list[float]) -> str:
    return "[" + ",".join(str(value) for value in values) + "]"


def embed(client: genai.Client, text: str) -> list[float]:
    response = client.models.embed_content(
        model="gemini-embedding-001",
        contents=text,
        config={"output_dimensionality": 768},
    )
    return response.embeddings[0].values


def backfill_skill_profiles(conn, client: genai.Client) -> int:
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """
        SELECT sp.id AS skill_profile_id, s.id, s.name, s.level, s.confidence,
               s."repoCount", s."commitCount"
        FROM skill_profiles sp
        JOIN skills s ON s."skillProfileId" = sp.id
        ORDER BY sp.id, s.name
        """
    )
    rows = cur.fetchall()
    cur.close()

    profiles: dict[str, list[dict]] = {}
    for row in rows:
        profiles.setdefault(row["skill_profile_id"], []).append(dict(row))

    updated = 0
    for skill_profile_id, skills in profiles.items():
        canonical = canonicalize_skills(skills)
        write_cur = conn.cursor()
        try:
            write_cur.execute('DELETE FROM skills WHERE "skillProfileId" = %s', (skill_profile_id,))
            for skill in canonical:
                write_cur.execute(
                    """
                    INSERT INTO skills (
                        id, "skillProfileId", name, level, confidence,
                        "repoCount", "commitCount", "createdAt", "updatedAt"
                    )
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

            vector = vector_literal(embed(client, format_skill_embedding_text(canonical)))
            write_cur.execute(
                """
                INSERT INTO skill_embeddings (skill_profile_id, embedding, updated_at)
                VALUES (%s, %s::vector, now())
                ON CONFLICT (skill_profile_id) DO UPDATE SET
                    embedding = EXCLUDED.embedding,
                    updated_at = now()
                """,
                (skill_profile_id, vector),
            )
            conn.commit()
            updated += 1
        except Exception:
            conn.rollback()
            raise
        finally:
            write_cur.close()

    return updated


def backfill_issues(conn, client: genai.Client) -> int:
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """
        SELECT id, "requiredSkills"
        FROM issues
        WHERE classified = true
          AND COALESCE(array_length("requiredSkills", 1), 0) > 0
        """
    )
    issues = cur.fetchall()
    cur.close()

    updated = 0
    for issue in issues:
        canonical_names = [
            skill.name for skill in canonicalize_skills(issue["requiredSkills"] or [])
        ]
        vector = vector_literal(embed(client, format_issue_embedding_text(canonical_names)))

        write_cur = conn.cursor()
        try:
            write_cur.execute(
                'UPDATE issues SET "requiredSkills" = %s, "updatedAt" = now() WHERE id = %s',
                (canonical_names, issue["id"]),
            )
            write_cur.execute(
                """
                INSERT INTO issue_embeddings (issue_id, embedding, updated_at)
                VALUES (%s, %s::vector, now())
                ON CONFLICT (issue_id) DO UPDATE SET
                    embedding = EXCLUDED.embedding,
                    updated_at = now()
                """,
                (issue["id"], vector),
            )
            conn.commit()
            updated += 1
        except Exception:
            conn.rollback()
            raise
        finally:
            write_cur.close()

    return updated


def main() -> None:
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

    try:
        profile_count = backfill_skill_profiles(conn, client)
        issue_count = backfill_issues(conn, client)
    finally:
        conn.close()

    print(
        json.dumps(
            {
                "skillProfilesUpdated": profile_count,
                "issuesUpdated": issue_count,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
