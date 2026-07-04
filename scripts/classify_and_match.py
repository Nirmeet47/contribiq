# scripts/classify_and_match.py
#
# Skips issue fetching — only classifies unclassified issues and rescores matches.
# Safe to re-run anytime — skips already-classified issues, upserts matches.
#
# Model: openai/gpt-oss-120b (migrated off llama-3.3-70b-versatile, deprecated
# by Groq — decommissioned 2026-08-16). gpt-oss-120b is a reasoning model, so
# we set reasoning_effort="low" to keep it fast/cheap for a simple JSON task,
# plus response_format=json_object to keep output parse-clean.
#
# Rate limits — CHECK YOUR CURRENT GROQ CONSOLE LIMITS for gpt-oss-120b on your
# tier before relying on the values below; they differ from the old llama-3.3
# limits and may change:
#   Groq  — GROQ_SLEEP controls delay between calls
#   Gemini — 100 req/min, 1500 req/day → won't be the bottleneck at these volumes
#
# Tune MAX_CLASSIFY based on your plan and current rate limits:
#   Groq free  → start conservative, run multiple times
#   Groq paid  → bump to 500+
#
# Run: python scripts/classify_and_match.py

import os, re, sys, json, time, logging
import psycopg2, psycopg2.extras
from groq import Groq
from google import genai
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

sys.path.insert(0, os.path.abspath("."))
from agent.skill_canonical import canonicalize_skills, format_issue_embedding_text

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("classify_and_match")

# ── config — tune these ────────────────────────────────────────────────────────
MAX_CLASSIFY  = 50    # issues to classify per run (free Groq: keep at 25-30)
GROQ_SLEEP    = 2.5      # seconds between Groq calls (free: 2.5, paid: 0.5)
GEMINI_SLEEP  = 0.7      # seconds between Gemini embed calls
# ──────────────────────────────────────────────────────────────────────────────

GROQ_API_KEY   = os.environ["GROQ_API_KEY"]
GEMINI_API_KEY = os.environ["GEMINI_API_KEY"]
DATABASE_URL   = os.environ["DATABASE_URL"]

groq_client  = Groq(api_key=GROQ_API_KEY)
genai_client = genai.Client(api_key=GEMINI_API_KEY)


# ══════════════════════════════════════════════════════════════════════════════
# CLASSIFY
# ══════════════════════════════════════════════════════════════════════════════

CLASSIFY_SYSTEM_PROMPT = """You are a code issue classifier. Given a GitHub issue title and body,
output ONLY a valid JSON object with these exact fields:

{
  "difficulty": "beginner" | "intermediate" | "advanced",
  "estimatedHours": <number 1-40>,
  "requiredSkills": ["skill1", "skill2"],
  "issueType": "bug" | "feature" | "docs" | "refactor",
  "aiSummary": "<one sentence plain English summary, max 120 chars>"
}

Rules:
- Output ONLY the JSON object. No markdown, no explanation.
- difficulty: beginner = well-scoped, no deep codebase knowledge needed.
  intermediate = requires understanding the codebase. advanced = complex/architectural.
- requiredSkills: specific technologies involved e.g. ["React", "TypeScript", "CSS"].
  Max 5 skills. Use proper names (React not react, PostgreSQL not postgres).
- estimatedHours: realistic time for a competent developer unfamiliar with the codebase.
- aiSummary: what needs to be done, in plain English, one sentence."""


def classify_issue(title, body, repo_full_name):
    body_snippet = (body or "")[:1500]
    user_msg = f"Repo: {repo_full_name}\nTitle: {title}\n\nBody:\n{body_snippet}"
    raw = ""
    try:
        response = groq_client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=[
                {"role": "system", "content": CLASSIFY_SYSTEM_PROMPT},
                {"role": "user",   "content": user_msg},
            ],
            temperature=0.1,
            max_tokens=300,
            reasoning_effort="low",
            response_format={"type": "json_object"},
        )
        raw = response.choices[0].message.content or ""
        match = re.search(r"\{[\s\S]*\}", raw)
        data = json.loads(match.group(0) if match else raw)

        assert data.get("difficulty") in ("beginner", "intermediate", "advanced")
        assert data.get("issueType") in ("bug", "feature", "docs", "refactor")
        assert isinstance(data.get("requiredSkills"), list)
        assert isinstance(data.get("estimatedHours"), (int, float))
        assert isinstance(data.get("aiSummary"), str)
        return data
    except Exception as e:
        log.warning(f"    classify failed: {e} | raw: {raw[:80]}")
        return None


def embed_skills(skills):
    if not skills:
        return None
    text = format_issue_embedding_text(skills)
    try:
        resp = genai_client.models.embed_content(
            model="gemini-embedding-001",
            contents=text,
            config={"output_dimensionality": 768},
        )
        return resp.embeddings[0].values
    except Exception as e:
        log.warning(f"    embed failed: {e}")
        return None


def step_classify(conn):
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """
        SELECT i.id, i.title, i.body, r."fullName"
        FROM   issues i
        JOIN   repos  r ON r.id = i."repoId"
        WHERE  i.classified = false
        ORDER  BY i."createdAt" DESC
        LIMIT  %s
        """,
        (MAX_CLASSIFY,),
    )
    issues = cur.fetchall()
    cur.close()

    remaining_cur = conn.cursor()
    remaining_cur.execute('SELECT COUNT(*) FROM issues WHERE classified = false')
    total_remaining = remaining_cur.fetchone()[0]
    remaining_cur.close()

    log.info(f"Total unclassified in DB: {total_remaining}")
    log.info(f"Classifying {len(issues)} this run (MAX_CLASSIFY={MAX_CLASSIFY})")
    if total_remaining > MAX_CLASSIFY:
        log.info(f"~{total_remaining // MAX_CLASSIFY} more runs needed to classify all")

    done = 0
    for i, issue in enumerate(issues):
        log.info(f"[{i+1}/{len(issues)}] {issue['fullName']} — {issue['title'][:60]}")

        result = classify_issue(issue["title"], issue["body"], issue["fullName"])
        if not result:
            time.sleep(GROQ_SLEEP)
            continue

        required_skills = [s.name for s in canonicalize_skills(result["requiredSkills"])]

        time.sleep(GEMINI_SLEEP)
        vector = embed_skills(required_skills)

        plain_cur = conn.cursor()
        try:
            plain_cur.execute(
                """
                UPDATE issues SET
                    difficulty       = %s,
                    "estimatedHours" = %s,
                    "requiredSkills" = %s,
                    "issueType"      = %s,
                    "aiSummary"      = %s,
                    classified       = true,
                    "updatedAt"      = now()
                WHERE id = %s
                """,
                (
                    result["difficulty"],
                    result["estimatedHours"],
                    required_skills,
                    result["issueType"],
                    result["aiSummary"][:500],
                    issue["id"],
                ),
            )
            if vector:
                plain_cur.execute(
                    """
                    INSERT INTO issue_embeddings (issue_id, embedding, updated_at)
                    VALUES (%s, %s::vector, now())
                    ON CONFLICT (issue_id) DO UPDATE SET
                        embedding  = EXCLUDED.embedding,
                        updated_at = now()
                    """,
                    (issue["id"], json.dumps(vector)),
                )
            conn.commit()
            done += 1
            log.info(f"  ✓ {result['difficulty']} | {result['issueType']} | {required_skills[:3]}")
        except Exception as e:
            conn.rollback()
            log.error(f"  ✗ db write failed: {e}")
        finally:
            plain_cur.close()

        time.sleep(GROQ_SLEEP)

    log.info(f"\nClassify done — {done}/{len(issues)} issues classified\n")


# ══════════════════════════════════════════════════════════════════════════════
# MATCH
# ══════════════════════════════════════════════════════════════════════════════

def step_match(conn):
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """
        SELECT u.id, u.interests, u."timeCommitment",
               sp.id AS skill_profile_id,
               array_agg(DISTINCT lower(s.name)) FILTER (WHERE s."isLanguage" = true) AS known_languages
        FROM   users u
        JOIN   skill_profiles sp ON sp."userId" = u.id
        JOIN   skill_embeddings se ON se.skill_profile_id = sp.id
        LEFT JOIN skills s ON s."skillProfileId" = sp.id
        GROUP BY u.id, u.interests, u."timeCommitment", sp.id
        """
    )
    users = cur.fetchall()
    cur.close()

    if not users:
        log.warning("No users with skill embeddings found — run onboarding first")
        return

    log.info(f"Scoring matches for {len(users)} user(s)")

    diff_score_map = {"beginner": 1.0, "intermediate": 0.6, "advanced": 0.2}

    for user in users:
        log.info(f"  User {user['id']} | langs: {user['known_languages']} | interests: {user['interests']}")

        score_cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        score_cur.execute(
            """
            SELECT
                i.id AS issue_id,
                i.difficulty,
                i."estimatedHours",
                r.language,
                r.categories,
                1 - (ie.embedding <=> se.embedding) AS skill_sim
            FROM   issue_embeddings ie
            JOIN   issues i  ON i.id  = ie.issue_id
            JOIN   repos  r  ON r.id  = i."repoId"
            JOIN   skill_embeddings se ON se.skill_profile_id = %s
            WHERE  i.classified = true
              AND  i.state = 'open'
              AND  (r.language IS NULL OR lower(r.language) = ANY(%s))
            ORDER  BY skill_sim DESC
            LIMIT  500
            """,
            (user["skill_profile_id"], list(user["known_languages"] or [])),
        )
        scored_issues = score_cur.fetchall()
        score_cur.close()

        log.info(f"    {len(scored_issues)} language-matching classified issues found")

        user_interests  = {i.lower() for i in (user["interests"] or [])}
        known_languages = set(user["known_languages"] or [])

        upsert_cur = conn.cursor()
        matched = 0

        for row in scored_issues:
            skill_sim     = float(row["skill_sim"])
            repo_language = (row["language"] or "").lower()

            if not repo_language:
                lang_penalty = 0.85
            elif repo_language in known_languages:
                lang_penalty = 1.0
            else:
                continue  # hard filter — skip wrong language

            repo_cats    = {c.lower() for c in (row["categories"] or [])}
            interest_sim = 1.0 if repo_cats & user_interests else 0.0
            if interest_sim == 0.0 and user_interests & {"ai", "ai_ml"}:
                ai_cats = {"ai", "ai_ml", "ml", "ai/ml", "machine-learning", "machine learning"}
                interest_sim = 1.0 if repo_cats & ai_cats else 0.0

            diff_score      = diff_score_map.get(row["difficulty"] or "intermediate", 0.6)
            estimated_hours = float(row["estimatedHours"] or 0)
            if estimated_hours <= 0:
                time_fit = 0.7
            else:
                preferred = 4 if user["timeCommitment"] <= 4 else 8 if user["timeCommitment"] <= 7 else 16
                time_fit  = max(
                    0.35,
                    1 - abs(estimated_hours - preferred) / max(estimated_hours, preferred, 1),
                )

            final_score = round(
                (skill_sim * lang_penalty) * 0.65 + interest_sim * 0.2 + diff_score * 0.1 + time_fit * 0.05,
                4,
            )

            try:
                upsert_cur.execute(
                    """
                    INSERT INTO issue_matches (
                        id, "userId", "issueId", score,
                        "skillSim", "langPenalty", "interestSim", "diffScore",
                        "createdAt", "updatedAt"
                    )
                    VALUES (gen_random_uuid()::text, %s, %s, %s, %s, %s, %s, %s, now(), now())
                    ON CONFLICT ("userId", "issueId") DO UPDATE SET
                        score         = EXCLUDED.score,
                        "skillSim"    = EXCLUDED."skillSim",
                        "langPenalty" = EXCLUDED."langPenalty",
                        "interestSim" = EXCLUDED."interestSim",
                        "diffScore"   = EXCLUDED."diffScore",
                        "updatedAt"   = now()
                    """,
                    (user["id"], row["issue_id"], final_score, skill_sim, lang_penalty, interest_sim, diff_score),
                )
                matched += 1
            except Exception as e:
                log.error(f"    match upsert failed: {e}")

        conn.commit()
        upsert_cur.close()
        log.info(f"    ✓ {matched} matches written for this user")

    log.info(f"\nMatch scoring done\n")


# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

def main():
    log.info("=" * 55)
    log.info(f"ContribIQ — classify & match (MAX={MAX_CLASSIFY})")
    log.info("=" * 55)

    conn = psycopg2.connect(DATABASE_URL)
    try:
        log.info("\n── Classifying issues ────────────────────────────────")
        step_classify(conn)

        log.info("── Scoring matches ───────────────────────────────────")
        step_match(conn)
    finally:
        conn.close()

    log.info("=" * 55)
    log.info("Done. Dashboard refreshes within 5 min (Redis TTL).")
    log.info("=" * 55)


if __name__ == "__main__":
    main()