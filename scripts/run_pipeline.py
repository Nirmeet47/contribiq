# scripts/run_pipeline.py
#
# Runs the full issue pipeline in one shot so you can see your feed immediately.
# Does NOT use BullMQ — runs everything directly and synchronously.
#
# Pipeline:
#   Step 1 — Fetch open issues from all seeded repos (GitHub API)
#   Step 2 — Classify each issue with Groq (difficulty, requiredSkills, aiSummary, etc.)
#   Step 3 — Embed requiredSkills with Gemini → store in issue_embeddings (pgvector)
#   Step 4 — Run match scoring for every user who has a skill embedding
#             (cosine similarity → issue_matches table)
#
# Run: python scripts/run_pipeline.py
# Needs: GITHUB_TOKEN, GROQ_API_KEY, GEMINI_API_KEY, DATABASE_URL in .env
#
# Safe to re-run — all inserts use ON CONFLICT DO UPDATE / DO NOTHING.
# On re-runs it skips already-classified issues and jumps straight to scoring.

import os
import re
import json
import time
import logging
import sys
import psycopg2
import psycopg2.extras
import httpx
from groq import Groq
from google import genai
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from agent.skill_canonical import canonicalize_skills, format_issue_embedding_text

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("pipeline")

# ── env ────────────────────────────────────────────────────────────────────────
GITHUB_TOKEN  = os.environ["GITHUB_TOKEN"]
GROQ_API_KEY  = os.environ["GROQ_API_KEY"]
GEMINI_API_KEY = os.environ["GEMINI_API_KEY"]
DATABASE_URL  = os.environ["DATABASE_URL"]

GITHUB_HEADERS = {
    "Authorization": f"Bearer {GITHUB_TOKEN}",
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
}

# how many open issues to fetch per repo (GitHub max per page = 100)
ISSUES_PER_REPO = 30

# how many issues to classify per run — classification costs Groq calls so
# we cap it to avoid hitting rate limits in one shot.
# increase once you've confirmed it works end-to-end.
MAX_CLASSIFY   = 200

groq_client   = Groq(api_key=GROQ_API_KEY)
genai_client  = genai.Client(api_key=GEMINI_API_KEY)


# ══════════════════════════════════════════════════════════════════════════════
# STEP 1 — FETCH ISSUES
# ══════════════════════════════════════════════════════════════════════════════

def fetch_issues_for_repo(repo: dict) -> list[dict]:
    """
    Fetch open issues for a single repo via GitHub REST API.
    Skips pull requests (GitHub returns PRs mixed in with issues).
    """
    owner, name = repo["owner"], repo["name"]
    url = f"https://api.github.com/repos/{owner}/{name}/issues"

    try:
        resp = httpx.get(
            url,
            headers=GITHUB_HEADERS,
            params={
                "state":     "open",
                "per_page":  ISSUES_PER_REPO,
                "sort":      "updated",
                "direction": "desc",
            },
            timeout=15,
        )
        if resp.status_code == 404:
            log.warning(f"  {owner}/{name} — 404, skipping")
            return []
        if resp.status_code == 403:
            log.warning(f"  {owner}/{name} — rate limited, waiting 60s")
            time.sleep(60)
            return []
        resp.raise_for_status()

        # filter out pull requests — they share the /issues endpoint
        issues = [i for i in resp.json() if "pull_request" not in i]
        return issues

    except Exception as e:
        log.error(f"  {owner}/{name} fetch failed: {e}")
        return []


def upsert_issues(cur, repo_db_id: str, issues: list[dict]) -> int:
    """
    Write raw issue rows with classified=false.
    Returns count of newly inserted issues (skips duplicates).
    """
    inserted = 0
    for issue in issues:
        try:
            raw_labels = issue.get("labels") or []
            labels = [
                label.get("name", "") if isinstance(label, dict) else str(label)
                for label in raw_labels
            ]
            cur.execute(
                """
                INSERT INTO issues (
                    id, "githubId", "repoId", title, body, state,
                    labels, "assigneeCount", "githubUrl", classified,
                    "createdAt", "updatedAt"
                )
                VALUES (
                    gen_random_uuid()::text, %s, %s, %s, %s, 'open',
                    %s, %s, %s, false,
                    now(), now()
                )
                ON CONFLICT ("githubId", "repoId") DO NOTHING
                """,
                (
                    issue["number"],
                    repo_db_id,
                    issue["title"][:500],
                    (issue.get("body") or "")[:10000],
                    labels,
                    len(issue.get("assignees") or []),
                    issue["html_url"],
                ),
            )
            if cur.rowcount > 0:
                inserted += 1
        except Exception as e:
            cur.connection.rollback()
            log.error(f"    issue insert error: {e}")
    return inserted


def step1_fetch(conn):
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute('SELECT id, owner, name, "fullName" FROM repos ORDER BY "createdAt"')
    repos = cur.fetchall()
    log.info(f"Found {len(repos)} repos in DB")

    total_new = 0
    for i, repo in enumerate(repos):
        log.info(f"[{i+1}/{len(repos)}] {repo['fullName']}")
        issues = fetch_issues_for_repo(repo)
        if not issues:
            continue

        plain_cur = conn.cursor()
        new = upsert_issues(plain_cur, repo["id"], issues)
        conn.commit()
        plain_cur.close()

        log.info(f"  {len(issues)} fetched, {new} new")
        total_new += new
        time.sleep(0.3)   # gentle on GitHub rate limits

    cur.close()
    log.info(f"\nStep 1 done — {total_new} new issues written\n")


# ══════════════════════════════════════════════════════════════════════════════
# STEP 2 — CLASSIFY ISSUES WITH GROQ
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


def classify_issue(title: str, body: str, repo_full_name: str) -> dict | None:
    """Ask Groq to classify a single issue. Returns parsed dict or None on failure."""
    body_snippet = (body or "")[:1500]  # truncate long bodies

    user_msg = f"Repo: {repo_full_name}\nTitle: {title}\n\nBody:\n{body_snippet}"

    try:
        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": CLASSIFY_SYSTEM_PROMPT},
                {"role": "user",   "content": user_msg},
            ],
            temperature=0.1,
            max_tokens=300,
        )
        raw = response.choices[0].message.content or ""

        # strip markdown fences if model adds them
        match = re.search(r"\{[\s\S]*\}", raw)
        if match:
            data = json.loads(match.group(0))
        else:
            data = json.loads(raw)

        # validate required fields
        assert data.get("difficulty") in ("beginner", "intermediate", "advanced")
        assert data.get("issueType") in ("bug", "feature", "docs", "refactor")
        assert isinstance(data.get("requiredSkills"), list)
        assert isinstance(data.get("estimatedHours"), (int, float))
        assert isinstance(data.get("aiSummary"), str)

        return data

    except Exception as e:
        log.warning(f"    classify failed: {e} | raw: {raw[:80] if 'raw' in dir() else ''}")
        return None


def embed_skills(skills: list[str]) -> list[float] | None:
    """Embed the requiredSkills list as a single string using Gemini."""
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


def step2_classify(conn):
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # fetch unclassified issues, join repo fullName for context
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

    log.info(f"Found {len(issues)} unclassified issues (cap: {MAX_CLASSIFY})")

    done = 0
    for i, issue in enumerate(issues):
        log.info(f"[{i+1}/{len(issues)}] {issue['fullName']} — {issue['title'][:60]}")

        result = classify_issue(issue["title"], issue["body"], issue["fullName"])
        if not result:
            continue

        required_skills = [skill.name for skill in canonicalize_skills(result["requiredSkills"])]

        # embed the requiredSkills
        vector = embed_skills(required_skills)

        plain_cur = conn.cursor()
        try:
            # update the issue row with classification data
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

            # upsert embedding if we got one
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
            log.info(
                f"  ✓ {result['difficulty']} | {result['issueType']} "
                f"| {required_skills[:3]}"
            )

        except Exception as e:
            conn.rollback()
            log.error(f"  ✗ db write failed: {e}")
        finally:
            plain_cur.close()

        # small pause — Groq free tier allows ~30 req/min
        time.sleep(0.5)

    log.info(f"\nStep 2 done — {done}/{len(issues)} issues classified\n")


# ══════════════════════════════════════════════════════════════════════════════
# STEP 3 — MATCH SCORING
# ══════════════════════════════════════════════════════════════════════════════

def step3_match(conn):
    """
    For every user who has a skill embedding, run pgvector cosine similarity
    against all issue embeddings and write scored IssueMatch rows.

    Score formula (from issue_match.prisma comments):
        score = (skillSim * langPenalty) * 0.65 + interestSim * 0.2 + diffScore * 0.1 + timeFit * 0.05

    timeFit:
        <=4 hrs/week  → prefers ~4h issues
        <=7 hrs/week  → prefers ~8h issues
        >7 hrs/week   → prefers ~16h issues

    diffScore:
        beginner     → 1.0  (most accessible)
        intermediate → 0.6
        advanced     → 0.2
    """
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # fetch all users who have completed skill embedding
    cur.execute(
        """
        SELECT u.id, u.interests, u."timeCommitment",
               sp.id AS skill_profile_id,
               array_agg(DISTINCT lower(s.name)) FILTER (WHERE s."isLanguage" = true) AS known_languages
        FROM   users        u
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

    for user in users:
        log.info(f"  User {user['id']} | interests: {user['interests']}")

        score_cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # pgvector cosine similarity: 1 - (embedding <=> skill_embedding)
        # we join repos so we can compute interestSim from repo.categories
        score_cur.execute(
            """
            SELECT
                i.id                                                    AS issue_id,
                i.difficulty,
                i."estimatedHours",
                r.language,
                r.categories,
                1 - (ie.embedding <=> se.embedding)                    AS skill_sim
            FROM   issue_embeddings  ie
            JOIN   issues            i  ON i.id  = ie.issue_id
            JOIN   repos             r  ON r.id  = i."repoId"
            JOIN   skill_embeddings  se ON se.skill_profile_id = %s
            WHERE  i.classified = true
              AND  i.state = 'open'
            ORDER  BY skill_sim DESC
            LIMIT  500
            """,
            (user["skill_profile_id"],),
        )
        scored_issues = score_cur.fetchall()
        score_cur.close()

        log.info(f"    {len(scored_issues)} classified issues to score")

        user_interests = {interest.lower() for interest in (user["interests"] or [])}
        known_languages = set(user["known_languages"] or [])

        diff_score_map = {
            "beginner":     1.0,
            "intermediate": 0.6,
            "advanced":     0.2,
        }

        upsert_cur = conn.cursor()
        matched = 0

        for row in scored_issues:
            skill_sim    = float(row["skill_sim"])
            repo_language = (row["language"] or "").lower()
            if not repo_language:
                lang_penalty = 0.85
            elif repo_language in known_languages:
                lang_penalty = 1.0
            else:
                continue

            repo_cats    = {category.lower() for category in (row["categories"] or [])}
            interest_sim = 1.0 if repo_cats & user_interests else 0.0
            if interest_sim == 0.0 and user_interests & {"ai", "ai_ml"}:
                ai_categories = {"ai", "ai_ml", "ml", "ai/ml", "machine-learning", "machine learning"}
                interest_sim = 1.0 if repo_cats & ai_categories else 0.0
            diff_score   = diff_score_map.get(row["difficulty"] or "intermediate", 0.6)
            estimated_hours = float(row["estimatedHours"] or 0)
            if estimated_hours <= 0:
                time_fit = 0.7
            else:
                preferred_hours = 4 if user["timeCommitment"] <= 4 else 8 if user["timeCommitment"] <= 7 else 16
                time_fit = max(
                    0.35,
                    1 - abs(estimated_hours - preferred_hours) / max(estimated_hours, preferred_hours, 1),
                )

            final_score  = round(
                (skill_sim * lang_penalty) * 0.65 + interest_sim * 0.2 + diff_score * 0.1 + time_fit * 0.05, 4
            )

            try:
                upsert_cur.execute(
                    """
                    INSERT INTO issue_matches (
                        id, "userId", "issueId", score,
                        "skillSim", "langPenalty", "interestSim", "diffScore",
                        "createdAt", "updatedAt"
                    )
                    VALUES (
                        gen_random_uuid()::text, %s, %s, %s,
                        %s, %s, %s, %s,
                        now(), now()
                    )
                    ON CONFLICT ("userId", "issueId") DO UPDATE SET
                        score        = EXCLUDED.score,
                        "skillSim"   = EXCLUDED."skillSim",
                        "langPenalty"= EXCLUDED."langPenalty",
                        "interestSim"= EXCLUDED."interestSim",
                        "diffScore"  = EXCLUDED."diffScore",
                        "updatedAt"  = now()
                    """,
                    (
                        user["id"], row["issue_id"], final_score,
                        skill_sim, lang_penalty, interest_sim, diff_score,
                    ),
                )
                matched += 1
            except Exception as e:
                log.error(f"    match upsert failed: {e}")

        conn.commit()
        upsert_cur.close()
        log.info(f"    ✓ {matched} matches written for this user")

    log.info(f"\nStep 3 done — match scoring complete\n")


# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

def main():
    log.info("=" * 55)
    log.info("ContribIQ pipeline runner")
    log.info("=" * 55)

    conn = psycopg2.connect(DATABASE_URL)

    try:
        log.info("\n── STEP 1: Fetch issues from GitHub ──────────────────")
        step1_fetch(conn)

        log.info("── STEP 2: Classify issues with Groq + Gemini ────────")
        step2_classify(conn)

        log.info("── STEP 3: Score matches for all users ───────────────")
        step3_match(conn)

    finally:
        conn.close()

    log.info("=" * 55)
    log.info("Pipeline complete. Refresh your dashboard to see results.")
    log.info("=" * 55)


if __name__ == "__main__":
    main()
