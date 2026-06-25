# scripts/seed_repos.py
#
# Discovers 100-200 real, active GitHub repos across all major topics
# and seeds them into the repos table.
#
# Flow:
#   1. For each GitHub topic, search repos with good-first-issues + min stars
#   2. Deduplicate across topics by fullName
#   3. For each unique repo, ask Groq to assign app categories
#      from: ["frontend", "backend", "ai", "devops", "docs", "testing", "tools", "mobile"]
#   4. Compute maintainerScore from recent closed issue activity
#   5. Upsert into repos table (safe to re-run)
#
# Run: python scripts/seed_repos.py
# Needs: GITHUB_TOKEN, GROQ_API_KEY, DATABASE_URL in .env (same file as the rest of the app)
#
# Rate limits:
#   GitHub search API: 30 requests/min for authenticated users
#   We sleep between searches to stay safe.
#   Total API calls: ~(num_topics * 1 search) + (num_repos * ~2 calls) ≈ 300-400 calls
#   Well within the 5000/hr limit.

import os
import json
import time
import logging
import psycopg2
import httpx
from groq import Groq
from dotenv import load_dotenv

# load .env from project root (same as the rest of the app)
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("seed_repos")

GITHUB_TOKEN = os.environ["GITHUB_TOKEN"]
GROQ_API_KEY = os.environ["GROQ_API_KEY"]
DATABASE_URL = os.environ["DATABASE_URL"]

HEADERS = {
    "Authorization": f"Bearer {GITHUB_TOKEN}",
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
}

# ─── target: 100-200 repos ────────────────────────────────────────────────────
# Each topic fetches up to REPOS_PER_TOPIC repos.
# With ~35 topics × 5 repos = 175 before deduplication → lands ~120-150 unique repos.
REPOS_PER_TOPIC = 5

# min bar: repo must have at least this many open good-first-issues
# keeps out repos that claim a topic but aren't actually contributor-friendly
MIN_GOOD_FIRST_ISSUES = 3

# min stars — filters out toy/abandoned projects
MIN_STARS = 500

# ─── GitHub topics to cover ───────────────────────────────────────────────────
# These are real GitHub topic slugs (as they appear in github.com/topics/<slug>).
# Grouped by which app category they primarily belong to — Groq still decides
# the final categories[], but this grouping is used as a hint.
#
# To add more: browse https://github.com/topics and add the slug string.

TOPICS = [
    # frontend
    ("frontend",  "react"),
    ("frontend",  "nextjs"),
    ("frontend",  "vue"),
    ("frontend",  "svelte"),
    ("frontend",  "angular"),
    ("frontend",  "tailwindcss"),
    ("frontend",  "typescript"),
    ("frontend",  "webassembly"),

    # backend
    ("backend",   "nodejs"),
    ("backend",   "fastapi"),
    ("backend",   "django"),
    ("backend",   "flask"),
    ("backend",   "expressjs"),
    ("backend",   "graphql"),
    ("backend",   "rust"),
    ("backend",   "golang"),
    ("backend",   "java"),
    ("backend",   "spring-boot"),

    # ai / ml
    ("ai",        "machine-learning"),
    ("ai",        "deep-learning"),
    ("ai",        "llm"),
    ("ai",        "langchain"),
    ("ai",        "pytorch"),
    ("ai",        "tensorflow"),
    ("ai",        "huggingface"),
    ("ai",        "computer-vision"),
    ("ai",        "nlp"),

    # devops / infra
    ("devops",    "kubernetes"),
    ("devops",    "docker"),
    ("devops",    "terraform"),
    ("devops",    "ansible"),
    ("devops",    "ci-cd"),
    ("devops",    "prometheus"),

    # docs
    ("docs",      "documentation"),
    ("docs",      "static-site-generator"),
    ("docs",      "jekyll"),

    # testing
    ("testing",   "testing"),
    ("testing",   "end-to-end-testing"),
    ("testing",   "test-automation"),

    # developer tools
    ("tools",     "cli"),
    ("tools",     "developer-tools"),
    ("tools",     "code-editor"),
    ("tools",     "linter"),
    ("tools",     "build-tool"),
    ("tools",     "package-manager"),

    # mobile
    ("mobile",    "android"),
    ("mobile",    "ios"),
    ("mobile",    "react-native"),
    ("mobile",    "flutter"),
    ("mobile",    "kotlin"),
    ("mobile",    "swift"),
]

VALID_CATEGORIES = ["frontend", "backend", "ai", "devops", "docs", "testing", "tools", "mobile"]

groq = Groq(api_key=GROQ_API_KEY)


# ─── GitHub helpers ────────────────────────────────────────────────────────────

def search_repos(topic: str) -> list[dict]:
    """
    Search GitHub for repos matching a topic that have beginner-friendly issues.
    Returns raw repo dicts from the GitHub API.
    """
    query = (
        f"topic:{topic} "
        f"good-first-issues:>={MIN_GOOD_FIRST_ISSUES} "
        f"stars:>={MIN_STARS} "
        f"archived:false "
        f"is:public"
    )

    resp = httpx.get(
        "https://api.github.com/search/repositories",
        headers=HEADERS,
        params={
            "q":        query,
            "sort":     "stars",
            "order":    "desc",
            "per_page": REPOS_PER_TOPIC,
        },
        timeout=20,
    )

    if resp.status_code == 403:
        # rate limited — wait and retry once
        log.warning("GitHub rate limited, waiting 60s...")
        time.sleep(60)
        resp = httpx.get(
            "https://api.github.com/search/repositories",
            headers=HEADERS,
            params={
                "q":        query,
                "sort":     "stars",
                "order":    "desc",
                "per_page": REPOS_PER_TOPIC,
            },
            timeout=20,
        )

    if resp.status_code != 200:
        log.warning(f"  search failed for topic:{topic} — HTTP {resp.status_code}")
        return []

    items = resp.json().get("items", [])

    # filter out forks and repos with almost no open issues
    return [
        r for r in items
        if not r.get("fork")
        and not r.get("archived")
        and r.get("open_issues_count", 0) >= 3
    ]


def compute_maintainer_score(full_name: str) -> float:
    """
    Rough maintainer responsiveness score (0-1).
    Looks at the last 20 closed issues — what % had at least one comment
    (i.e. a maintainer actually responded before closing).
    Falls back to 0.5 if the API call fails.
    """
    try:
        resp = httpx.get(
            f"https://api.github.com/repos/{full_name}/issues",
            headers=HEADERS,
            params={"state": "closed", "per_page": 20, "sort": "updated"},
            timeout=10,
        )
        if resp.status_code != 200:
            return 0.5

        issues = resp.json()
        if not issues:
            return 0.5

        responded = sum(1 for i in issues if i.get("comments", 0) > 0)
        return round(responded / len(issues), 2)

    except Exception:
        return 0.5


def compute_activity_score(repo: dict) -> float:
    """
    Simple activity score (0-1) based on stars and open issues.
    Stars proxy for community health; open issues proxy for active development.
    This avoids extra API calls — all data is already in the search result.
    """
    stars = repo.get("stargazers_count", 0)
    open_issues = repo.get("open_issues_count", 0)

    # normalise: >10k stars = 1.0, >100 open issues = 1.0
    star_score  = min(stars / 10_000, 1.0)
    issue_score = min(open_issues / 100, 1.0)

    return round(star_score * 0.6 + issue_score * 0.4, 2)


# ─── Groq category assignment ──────────────────────────────────────────────────

def assign_categories(repo: dict, hint: str) -> list[str]:
    """
    Ask Groq to assign 1-3 categories from VALID_CATEGORIES.
    We pass the repo's name, description, topics, and language as context.
    The hint (from our TOPICS list) is included but Groq can override it.
    """
    topics_str = ", ".join(repo.get("topics", [])) or "none"
    desc = (repo.get("description") or "")[:120]

    prompt = f"""Assign this GitHub repository to 1-3 categories from this exact list:
{json.dumps(VALID_CATEGORIES)}

Repository:
  name:        {repo["full_name"]}
  description: {desc}
  language:    {repo.get("language") or "unknown"}
  topics:      {topics_str}
  hint:        {hint}

Rules:
- Return ONLY a JSON array of strings from the list above.
- Include "docs" only if the repo IS a documentation tool or framework, not just because it has docs.
- Include "testing" only if the repo IS a testing framework or tool.
- A repo can belong to multiple categories (e.g. a React testing library → ["frontend", "testing"]).
- No explanation, no markdown, just the JSON array.

Example output: ["frontend", "tools"]"""

    try:
        response = groq.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=60,
        )
        raw = response.choices[0].message.content or "[]"

        # strip markdown fences if the model adds them
        import re
        match = re.search(r"\[.*?\]", raw, re.DOTALL)
        if match:
            cats = json.loads(match.group(0))
        else:
            cats = json.loads(raw)

        valid = [c for c in cats if c in VALID_CATEGORIES]
        return valid if valid else [hint]

    except Exception as e:
        log.warning(f"  Groq category assignment failed for {repo['full_name']}: {e}")
        return [hint]  # fall back to the topic hint


# ─── DB helpers ────────────────────────────────────────────────────────────────

def upsert_repo(cur, repo: dict, categories: list[str], maintainer_score: float, activity_score: float):
    """
    Insert or update a repo row. Safe to re-run — ON CONFLICT updates mutable fields.
    id uses gen_random_uuid() which is available in Postgres with pgcrypto (enabled by default in Supabase).
    """
    cur.execute(
        """
        INSERT INTO repos (
            id, owner, name, "fullName", description, categories,
            stars, language, "maintainerScore", "activityScore",
            "createdAt", "updatedAt"
        )
        VALUES (
            gen_random_uuid()::text, %s, %s, %s, %s, %s,
            %s, %s, %s, %s,
            now(), now()
        )
        ON CONFLICT ("fullName") DO UPDATE SET
            stars            = EXCLUDED.stars,
            description      = EXCLUDED.description,
            categories       = EXCLUDED.categories,
            language         = EXCLUDED.language,
            "maintainerScore"= EXCLUDED."maintainerScore",
            "activityScore"  = EXCLUDED."activityScore",
            "updatedAt"      = now()
        """,
        (
            repo["owner"]["login"],
            repo["name"],
            repo["full_name"],
            repo.get("description") or "",
            categories,
            repo.get("stargazers_count", 0),
            repo.get("language"),
            maintainer_score,
            activity_score,
        ),
    )


# ─── main ──────────────────────────────────────────────────────────────────────

def seed():
    conn = psycopg2.connect(DATABASE_URL)
    cur  = conn.cursor()

    seen:   set[str] = set()   # fullNames already processed this run
    seeded: int      = 0
    failed: int      = 0

    log.info(f"Starting repo seed — {len(TOPICS)} topics × up to {REPOS_PER_TOPIC} repos each")
    log.info(f"Target: 100-200 unique repos\n")

    for idx, (hint, topic) in enumerate(TOPICS):
        log.info(f"[{idx+1}/{len(TOPICS)}] topic:{topic}  (hint: {hint})")

        try:
            repos = search_repos(topic)
        except Exception as e:
            log.error(f"  search error: {e}")
            time.sleep(3)
            continue

        log.info(f"  {len(repos)} results from GitHub")

        for repo in repos:
            full_name = repo["full_name"]

            if full_name in seen:
                log.info(f"  skip {full_name} (already processed)")
                continue
            seen.add(full_name)

            log.info(f"  → {full_name}  ({repo.get('stargazers_count', 0):,} ★  {repo.get('open_issues_count', 0)} open issues)")

            # ask groq for categories
            categories = assign_categories(repo, hint)
            log.info(f"     categories: {categories}")

            # check maintainer responsiveness
            maintainer_score = compute_maintainer_score(full_name)
            log.info(f"     maintainerScore: {maintainer_score}")

            # compute activity from search data (no extra API call)
            activity_score = compute_activity_score(repo)

            try:
                upsert_repo(cur, repo, categories, maintainer_score, activity_score)
                conn.commit()
                seeded += 1
                log.info(f"     ✓ saved ({seeded} total)")
            except Exception as e:
                conn.rollback()
                failed += 1
                log.error(f"     ✗ db error: {e}")

            # 0.5s between repos — keeps us well under GitHub's rate limits
            time.sleep(0.5)

        # GitHub's search API allows 30 requests/min for authenticated users.
        # With ~50 topics we do 50 search calls. A 2s pause between topics
        # means the whole search phase takes ~100s — no risk of hitting limits.
        time.sleep(2)

    cur.close()
    conn.close()

    log.info(f"\n{'='*50}")
    log.info(f"Seed complete.")
    log.info(f"  Repos inserted/updated : {seeded}")
    log.info(f"  Repos failed           : {failed}")
    log.info(f"  Total unique seen      : {len(seen)}")
    log.info(f"\nNext step: trigger your issueFetchWorker to pull open issues from these repos.")


if __name__ == "__main__":
    seed()