import json
import logging
import os
import re
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx
import psycopg2
from dotenv import load_dotenv
from groq import Groq

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("repo_discovery")

GITHUB_API = "https://api.github.com"
GITHUB_API_VERSION = "2022-11-28"
GROQ_MODEL = "llama-3.3-70b-versatile"

VALID_CATEGORIES = [
    "frontend",
    "backend",
    "ai",
    "devops",
    "docs",
    "testing",
    "tools",
    "mobile",
]

TOPICS = [
    ("frontend", "react"),
    ("frontend", "nextjs"),
    ("frontend", "vue"),
    ("frontend", "svelte"),
    ("frontend", "angular"),
    ("frontend", "tailwindcss"),
    ("frontend", "typescript"),
    ("backend", "nodejs"),
    ("backend", "fastapi"),
    ("backend", "django"),
    ("backend", "flask"),
    ("backend", "graphql"),
    ("backend", "rust"),
    ("backend", "golang"),
    ("ai", "machine-learning"),
    ("ai", "llm"),
    ("ai", "langchain"),
    ("ai", "pytorch"),
    ("ai", "huggingface"),
    ("devops", "kubernetes"),
    ("devops", "docker"),
    ("devops", "terraform"),
    ("docs", "documentation"),
    ("testing", "testing"),
    ("testing", "end-to-end-testing"),
    ("tools", "cli"),
    ("tools", "developer-tools"),
    ("tools", "linter"),
    ("mobile", "android"),
    ("mobile", "ios"),
    ("mobile", "react-native"),
    ("mobile", "flutter"),
]


@dataclass
class DiscoveryConfig:
    repos_per_topic: int
    min_good_first_issues: int
    min_stars: int
    fresh_days: int
    prune_check_limit: int

    @property
    def fresh_after(self) -> datetime:
        return datetime.now(UTC) - timedelta(days=self.fresh_days)

    @property
    def fresh_after_query(self) -> str:
        return self.fresh_after.date().isoformat()


def int_from_env(name: str, fallback: int) -> int:
    raw = os.getenv(name)
    if not raw:
        return fallback
    try:
        value = int(raw)
        return value if value > 0 else fallback
    except ValueError:
        return fallback


def load_config() -> DiscoveryConfig:
    return DiscoveryConfig(
        repos_per_topic=int_from_env("REPO_DISCOVERY_PER_TOPIC", 4),
        min_good_first_issues=int_from_env("REPO_DISCOVERY_MIN_GOOD_FIRST_ISSUES", 3),
        min_stars=int_from_env("REPO_DISCOVERY_MIN_STARS", 500),
        fresh_days=int_from_env("REPO_DISCOVERY_FRESH_DAYS", 180),
        prune_check_limit=int_from_env("REPO_DISCOVERY_PRUNE_CHECK_LIMIT", 40),
    )


def github_token() -> str:
    token = os.getenv("GITHUB_TOKEN") or os.getenv("GITHUB_PAT")
    if not token:
        raise RuntimeError("GITHUB_TOKEN or GITHUB_PAT is required")
    return token


def headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {github_token()}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
    }


def github_get(client: httpx.Client, path: str, params: dict[str, Any] | None = None) -> Any:
    response = client.get(f"{GITHUB_API}{path}", params=params)
    if response.status_code in (403, 429):
        log.warning("GitHub rate limited repo discovery, waiting 60s")
        time.sleep(60)
        response = client.get(f"{GITHUB_API}{path}", params=params)
    response.raise_for_status()
    return response.json()


def parse_github_time(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def is_fresh(repo: dict[str, Any], config: DiscoveryConfig) -> bool:
    pushed_at = parse_github_time(repo.get("pushed_at"))
    return bool(pushed_at and pushed_at >= config.fresh_after)


def search_repos(client: httpx.Client, topic: str, config: DiscoveryConfig) -> list[dict[str, Any]]:
    query = " ".join(
        [
            f"topic:{topic}",
            f"good-first-issues:>={config.min_good_first_issues}",
            f"stars:>={config.min_stars}",
            f"pushed:>={config.fresh_after_query}",
            "archived:false",
            "is:public",
        ]
    )
    payload = github_get(
        client,
        "/search/repositories",
        {
            "q": query,
            "sort": "updated",
            "order": "desc",
            "per_page": config.repos_per_topic,
        },
    )
    return [
        repo
        for repo in payload.get("items", [])
        if not repo.get("fork")
        and not repo.get("archived")
        and not repo.get("disabled")
        and repo.get("open_issues_count", 0) >= config.min_good_first_issues
        and is_fresh(repo, config)
    ]


def compute_activity_score(repo: dict[str, Any]) -> float:
    stars = repo.get("stargazers_count", 0)
    open_issues = repo.get("open_issues_count", 0)
    pushed_at = parse_github_time(repo.get("pushed_at"))
    star_score = min(stars / 10_000, 1.0)
    issue_score = min(open_issues / 100, 1.0)
    recency_score = 0.0
    if pushed_at:
        age_days = max((datetime.now(UTC) - pushed_at).days, 0)
        recency_score = max(0.0, 1 - age_days / 365)
    return round(star_score * 0.35 + issue_score * 0.35 + recency_score * 0.30, 2)


def compute_maintainer_score(client: httpx.Client, full_name: str) -> float:
    try:
        issues = github_get(
            client,
            f"/repos/{full_name}/issues",
            {"state": "closed", "per_page": 20, "sort": "updated", "direction": "desc"},
        )
        if not issues:
            return 0.5
        responded = sum(1 for issue in issues if issue.get("comments", 0) > 0)
        return round(responded / len(issues), 2)
    except Exception as exc:
        log.warning("maintainer score fallback for %s: %s", full_name, exc)
        return 0.5


def groq_client() -> Groq:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("GROQ_API_KEY is required")
    return Groq(api_key=api_key)


def assign_categories(client: Groq, repo: dict[str, Any], hint: str) -> list[str]:
    topics = ", ".join(repo.get("topics") or []) or "none"
    prompt = f"""Assign this GitHub repository to 1-3 categories from this exact list:
{json.dumps(VALID_CATEGORIES)}

Repository:
name: {repo["full_name"]}
description: {(repo.get("description") or "")[:200]}
language: {repo.get("language") or "unknown"}
topics: {topics}
hint: {hint}

Return only a JSON array of strings from the list.
"""
    try:
        response = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=80,
        )
        raw = response.choices[0].message.content or "[]"
        match = re.search(r"\[[\s\S]*\]", raw)
        parsed = json.loads(match.group(0) if match else raw)
        valid = [category for category in parsed if category in VALID_CATEGORIES]
        return valid[:3] if valid else [hint]
    except Exception as exc:
        log.warning("category assignment fallback for %s: %s", repo["full_name"], exc)
        return [hint]


def upsert_repo(cur, repo: dict[str, Any], categories: list[str], maintainer_score: float, activity_score: float) -> bool:
    cur.execute('SELECT id FROM repos WHERE "fullName" = %s', (repo["full_name"],))
    inserted = cur.fetchone() is None
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
            owner = EXCLUDED.owner,
            name = EXCLUDED.name,
            stars = EXCLUDED.stars,
            description = EXCLUDED.description,
            categories = EXCLUDED.categories,
            language = EXCLUDED.language,
            "maintainerScore" = EXCLUDED."maintainerScore",
            "activityScore" = EXCLUDED."activityScore",
            "updatedAt" = now()
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
    return inserted


def repo_has_user_ties(cur, repo_id: str, owner: str, name: str) -> bool:
    checks = [
        ('SELECT COUNT(*) FROM bookmarks b JOIN issues i ON i.id = b."issueId" WHERE i."repoId" = %s', (repo_id,)),
        ('SELECT COUNT(*) FROM working_on w JOIN issues i ON i.id = w."issueId" WHERE i."repoId" = %s', (repo_id,)),
        ('SELECT COUNT(*) FROM issue_feedback f JOIN issues i ON i.id = f."issueId" WHERE i."repoId" = %s', (repo_id,)),
        ('SELECT COUNT(*) FROM contributions WHERE "repoOwner" = %s AND "repoName" = %s', (owner, name)),
    ]
    for sql, params in checks:
        cur.execute(sql, params)
        if cur.fetchone()[0] > 0:
            return True
    return False


def prune_inactive_repos(conn, client: httpx.Client, config: DiscoveryConfig) -> dict[str, int]:
    pruned = 0
    protected = 0
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, owner, name, "fullName"
            FROM repos
            ORDER BY "lastFetchedAt" ASC NULLS FIRST, "updatedAt" ASC
            LIMIT %s
            """,
            (config.prune_check_limit,),
        )
        repos = cur.fetchall()
        for repo_id, owner, name, full_name in repos:
            try:
                details = github_get(client, f"/repos/{full_name}")
            except Exception as exc:
                log.warning("could not inspect %s: %s", full_name, exc)
                continue
            inactive = (
                details.get("archived")
                or details.get("disabled")
                or details.get("fork")
                or not is_fresh(details, config)
            )
            if not inactive:
                continue
            if repo_has_user_ties(cur, repo_id, owner, name):
                protected += 1
                log.info("protected stale repo with user ties: %s", full_name)
                continue
            cur.execute("DELETE FROM repos WHERE id = %s", (repo_id,))
            conn.commit()
            pruned += 1
            log.info("pruned inactive unused repo: %s", full_name)
    return {"pruned": pruned, "protected_old": protected}


def discover() -> dict[str, int]:
    config = load_config()
    stats = {
        "seen": 0,
        "upserted": 0,
        "inserted": 0,
        "updated": 0,
        "skipped": 0,
        "failed": 0,
        "pruned": 0,
        "protected_old": 0,
    }
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is required")
    seen: set[str] = set()
    ai = groq_client()
    with httpx.Client(headers=headers(), timeout=30) as gh, psycopg2.connect(database_url) as conn:
        for index, (hint, topic) in enumerate(TOPICS, start=1):
            log.info("[%s/%s] searching topic:%s", index, len(TOPICS), topic)
            try:
                repos = search_repos(gh, topic, config)
            except Exception as exc:
                log.warning("search failed for topic:%s: %s", topic, exc)
                stats["failed"] += 1
                continue
            for repo in repos:
                full_name = repo["full_name"]
                if full_name in seen:
                    continue
                seen.add(full_name)
                stats["seen"] += 1
                if not is_fresh(repo, config):
                    stats["skipped"] += 1
                    continue
                categories = assign_categories(ai, repo, hint)
                maintainer_score = compute_maintainer_score(gh, full_name)
                activity_score = compute_activity_score(repo)
                try:
                    with conn.cursor() as cur:
                        inserted = upsert_repo(cur, repo, categories, maintainer_score, activity_score)
                    conn.commit()
                    stats["upserted"] += 1
                    stats["inserted" if inserted else "updated"] += 1
                    log.info("saved %s categories=%s inserted=%s", full_name, categories, inserted)
                except Exception as exc:
                    conn.rollback()
                    stats["failed"] += 1
                    log.error("db save failed for %s: %s", full_name, exc)
                time.sleep(0.5)
            time.sleep(2)
        prune_stats = prune_inactive_repos(conn, gh, config)
        stats["pruned"] = prune_stats["pruned"]
        stats["protected_old"] = prune_stats["protected_old"]
    log.info("repo discovery complete: %s", stats)
    return stats


if __name__ == "__main__":
    discover()
