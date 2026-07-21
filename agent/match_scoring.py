import logging
import os
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("match_scoring")

SCORE_CONFIG = {
    "skill_weight": 0.65,
    "interest_weight": 0.2,
    "difficulty_weight": 0.1,
    "time_fit_weight": 0.05,
    "light_time_commitment_max_hours": 4,
    "steady_time_commitment_max_hours": 7,
    "light_preferred_issue_hours": 4,
    "steady_preferred_issue_hours": 8,
    "high_preferred_issue_hours": 16,
    "missing_estimate_time_fit_score": 0.7,
    "minimum_time_fit_score": 0.35,
}


def compute_match_score(
    skill_sim: float,
    lang_penalty: float,
    interest_sim: float,
    diff_score: float,
    time_fit: float,
) -> float:
    return (
        (skill_sim * lang_penalty) * SCORE_CONFIG["skill_weight"]
        + interest_sim * SCORE_CONFIG["interest_weight"]
        + diff_score * SCORE_CONFIG["difficulty_weight"]
        + time_fit * SCORE_CONFIG["time_fit_weight"]
    )


def score_matches(issue_id: str | None = None, user_id: str | None = None) -> dict[str, int | str]:
    if issue_id and user_id:
        raise ValueError("Provide either issue_id or user_id, not both")
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is required")

    user_filter = "AND u.id = %(user_id)s" if user_id else ""
    issue_filter = "AND i.id = %(issue_id)s" if issue_id else ""
    delete_filter = []
    if user_id:
        delete_filter.append('"userId" = %(user_id)s')
    if issue_id:
        delete_filter.append('"issueId" = %(issue_id)s')
    delete_where = f"WHERE {' AND '.join(delete_filter)}" if delete_filter else ""

    params = {
        "user_id": user_id,
        "issue_id": issue_id,
        **SCORE_CONFIG,
    }

    sql = f"""
    WITH user_vectors AS (
      SELECT
        u.id AS user_id,
        u.interests,
        u."timeCommitment" AS time_commitment,
        se.embedding AS skill_embedding,
        COALESCE(AVG(s.confidence), 0.5) AS avg_confidence,
        array_agg(DISTINCT lower(s.name)) FILTER (WHERE s."isLanguage" = true) AS known_languages
      FROM users u
      JOIN skill_profiles sp ON sp."userId" = u.id
      JOIN skill_embeddings se ON se.skill_profile_id = sp.id
      LEFT JOIN skills s ON s."skillProfileId" = sp.id
      WHERE u.onboarded = true
        {user_filter}
      GROUP BY u.id, u.interests, u."timeCommitment", se.embedding
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
                ON (
                  lower(user_interest) = lower(repo_category)
                  OR (
                    lower(user_interest) IN ('ai', 'ai_ml')
                    AND lower(repo_category) IN ('ai', 'ai_ml', 'ml', 'ai/ml', 'machine-learning', 'machine learning')
                  )
                )
            ) / GREATEST(array_length(uv.interests, 1), 1)
          )
        END AS interest_sim,
        CASE
          WHEN uv.avg_confidence >= 0.75 THEN
            CASE i.difficulty
              WHEN 'advanced' THEN 1.0
              WHEN 'intermediate' THEN 0.85
              ELSE 0.65
            END
          WHEN uv.avg_confidence >= 0.45 THEN
            CASE i.difficulty
              WHEN 'intermediate' THEN 1.0
              WHEN 'beginner' THEN 0.85
              ELSE 0.65
            END
          ELSE
            CASE i.difficulty
              WHEN 'beginner' THEN 1.0
              WHEN 'intermediate' THEN 0.75
              ELSE 0.45
            END
        END AS diff_score,
        CASE
          WHEN i."estimatedHours" IS NULL OR i."estimatedHours" <= 0 THEN %(missing_estimate_time_fit_score)s
          ELSE GREATEST(
            %(minimum_time_fit_score)s,
            1 - (
              ABS(
                i."estimatedHours" - CASE
                  WHEN uv.time_commitment <= %(light_time_commitment_max_hours)s THEN %(light_preferred_issue_hours)s
                  WHEN uv.time_commitment <= %(steady_time_commitment_max_hours)s THEN %(steady_preferred_issue_hours)s
                  ELSE %(high_preferred_issue_hours)s
                END
              ) / GREATEST(
                i."estimatedHours",
                CASE
                  WHEN uv.time_commitment <= %(light_time_commitment_max_hours)s THEN %(light_preferred_issue_hours)s
                  WHEN uv.time_commitment <= %(steady_time_commitment_max_hours)s THEN %(steady_preferred_issue_hours)s
                  ELSE %(high_preferred_issue_hours)s
                END,
                1
              )
            )
          )
        END AS time_fit_score,
        CASE
          WHEN r.language IS NULL THEN 0.85
          WHEN lower(r.language) = ANY(uv.known_languages) THEN 1.0
          ELSE 0.4
        END AS lang_penalty
      FROM user_vectors uv
      CROSS JOIN issue_embeddings ie
      JOIN issues i ON i.id = ie.issue_id
      JOIN repos r ON r.id = i."repoId"
      WHERE i.classified = true
        AND i.state = 'open'
        AND i.difficulty IS NOT NULL
        AND (
          r.language IS NULL
          OR lower(r.language) = ANY(uv.known_languages)
        )
        {issue_filter}
    )
    INSERT INTO issue_matches (
      id,
      "userId",
      "issueId",
      score,
      "skillSim",
      "langPenalty",
      "interestSim",
      "diffScore",
      "createdAt",
      "updatedAt"
    )
    SELECT
      gen_random_uuid()::text,
      user_id,
      issue_id,
      ((skill_sim * lang_penalty) * %(skill_weight)s) +
        (interest_sim * %(interest_weight)s) +
        (diff_score * %(difficulty_weight)s) +
        (time_fit_score * %(time_fit_weight)s),
      skill_sim,
      lang_penalty,
      interest_sim,
      diff_score,
      now(),
      now()
    FROM scored
    ON CONFLICT ("userId", "issueId")
    DO UPDATE SET
      score = EXCLUDED.score,
      "skillSim" = EXCLUDED."skillSim",
      "langPenalty" = EXCLUDED."langPenalty",
      "interestSim" = EXCLUDED."interestSim",
      "diffScore" = EXCLUDED."diffScore",
      "updatedAt" = now()
    """

    with psycopg2.connect(database_url) as conn:
      with conn.cursor() as cur:
        cur.execute(f"DELETE FROM issue_matches {delete_where}", params)
        deleted = cur.rowcount
        cur.execute(sql, params)
        upserted = cur.rowcount
      conn.commit()

    scope = f"issue:{issue_id}" if issue_id else f"user:{user_id}" if user_id else "all"
    result = {"scope": scope, "deleted": deleted, "upserted": upserted}
    log.info("match scoring complete: %s", result)
    return result


def main() -> None:
    score_matches()


if __name__ == "__main__":
    main()
