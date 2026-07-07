import logging
import os
import time
from pathlib import Path
from typing import Any

import httpx
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

from agent.issue_classifier import classify_unclassified_issues

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("issue_fetcher")

GITHUB_API = "https://api.github.com"
GITHUB_API_VERSION = "2022-11-28"


def int_from_env(name: str, fallback: int) -> int:
    raw = os.getenv(name)
    if not raw:
        return fallback
    try:
        value = int(raw)
        return value if value > 0 else fallback
    except ValueError:
        return fallback


def github_token() -> str:
    token = os.getenv("GITHUB_TOKEN") or os.getenv("GITHUB_PAT")
    if not token:
        raise RuntimeError("GITHUB_TOKEN or GITHUB_PAT is required")
    return token


def github_headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {github_token()}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
    }


def fetch_repos(conn, repo_filter: str | None = None) -> list[dict[str, Any]]:
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    if repo_filter:
        cur.execute(
            '''
            SELECT id, owner, name, "fullName"
            FROM repos
            WHERE id = %s OR "fullName" = %s
            ORDER BY "createdAt"
            ''',
            (repo_filter, repo_filter),
        )
    else:
        cur.execute('SELECT id, owner, name, "fullName" FROM repos ORDER BY "createdAt"')
    repos = cur.fetchall()
    cur.close()
    return repos


def fetch_open_issues(client: httpx.Client, owner: str, name: str, max_pages: int, page_size: int) -> tuple[list[dict[str, Any]], bool]:
    issues: list[dict[str, Any]] = []
    for page in range(1, max_pages + 1):
        response = client.get(
            f"{GITHUB_API}/repos/{owner}/{name}/issues",
            params={
                "state": "open",
                "per_page": page_size,
                "page": page,
                "sort": "updated",
                "direction": "desc",
            },
            timeout=30,
        )
        if response.status_code == 404:
            log.warning("%s/%s issues returned 404", owner, name)
            return [], True
        if response.status_code in (403, 429):
            log.warning("%s/%s issues rate limited, waiting 60s", owner, name)
            time.sleep(60)
            return issues, False
        response.raise_for_status()
        raw_items = response.json()
        page_items = [issue for issue in raw_items if "pull_request" not in issue]
        issues.extend(page_items)
        if len(raw_items) < page_size:
            return issues, True
    return issues, False


def calculate_repo_scores(issues: list[dict[str, Any]], page_size: int) -> tuple[float, float]:
    if not issues:
        return 0.0, 0.0
    now = time.time()
    day_seconds = 24 * 60 * 60

    def timestamp(value: str) -> float:
        return time.mktime(time.strptime(value.replace("Z", "+0000"), "%Y-%m-%dT%H:%M:%S%z"))

    recent_updated = sum(1 for issue in issues if now - timestamp(issue["updated_at"]) <= 14 * day_seconds)
    recent_created = sum(1 for issue in issues if now - timestamp(issue["created_at"]) <= 30 * day_seconds)
    commented = sum(1 for issue in issues if int(issue.get("comments") or 0) > 0)
    assigned = sum(1 for issue in issues if len(issue.get("assignees") or []) > 0)
    average_comments = sum(int(issue.get("comments") or 0) for issue in issues) / len(issues)
    denominator = max(min(len(issues), page_size), 1)
    activity_score = min(1.0, max(0.0, recent_updated / denominator * 0.65 + recent_created / denominator * 0.25 + min(average_comments / 6, 1.0) * 0.1))
    maintainer_score = min(1.0, max(0.0, commented / len(issues) * 0.55 + assigned / len(issues) * 0.25 + min(average_comments / 8, 1.0) * 0.2))
    return activity_score, maintainer_score


def labels_from_issue(issue: dict[str, Any]) -> list[str]:
    return [label.get("name", "") if isinstance(label, dict) else str(label) for label in issue.get("labels") or []]


def issue_changed(existing: dict[str, Any], issue: dict[str, Any], labels: list[str]) -> bool:
    return (
        existing["title"] != issue["title"]
        or (existing["body"] or "") != (issue.get("body") or "")
        or list(existing["labels"] or []) != labels
    )


def upsert_issues(conn, repo: dict[str, Any], issues: list[dict[str, Any]], complete_open_set: bool) -> tuple[int, int, int]:
    created = 0
    changed = 0
    seen_github_ids: list[int] = []
    for issue in issues:
        github_id = int(issue["id"])
        seen_github_ids.append(github_id)
        labels = labels_from_issue(issue)
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            '''
            SELECT id, title, body, labels, classified
            FROM issues
            WHERE "githubId" = %s AND "repoId" = %s
            ''',
            (github_id, repo["id"]),
        )
        existing = cur.fetchone()
        if existing:
            needs_reclassify = issue_changed(existing, issue, labels)
            cur.execute(
                """
                UPDATE issues SET
                    title = %s,
                    body = %s,
                    labels = %s,
                    state = 'open',
                    "assigneeCount" = %s,
                    "commentCount" = %s,
                    "githubUrl" = %s,
                    classified = CASE WHEN %s THEN false ELSE classified END,
                    "updatedAt" = now()
                WHERE id = %s
                """,
                (
                    issue["title"],
                    issue.get("body"),
                    labels,
                    len(issue.get("assignees") or []),
                    int(issue.get("comments") or 0),
                    issue["html_url"],
                    needs_reclassify,
                    existing["id"],
                ),
            )
            if needs_reclassify:
                changed += 1
        else:
            cur.execute(
                """
                INSERT INTO issues (
                    id, "githubId", "repoId", title, body, labels, state,
                    "assigneeCount", "commentCount", "githubUrl", classified,
                    "createdAt", "updatedAt"
                )
                VALUES (
                    gen_random_uuid()::text, %s, %s, %s, %s, %s, 'open',
                    %s, %s, %s, false,
                    now(), now()
                )
                """,
                (
                    github_id,
                    repo["id"],
                    issue["title"],
                    issue.get("body"),
                    labels,
                    len(issue.get("assignees") or []),
                    int(issue.get("comments") or 0),
                    issue["html_url"],
                ),
            )
            created += 1
        cur.close()

    closed = 0
    if complete_open_set:
        cur = conn.cursor()
        if seen_github_ids:
            cur.execute(
                """
                UPDATE issues
                SET state = 'closed', "updatedAt" = now()
                WHERE "repoId" = %s
                  AND state = 'open'
                  AND NOT ("githubId" = ANY(%s))
                """,
                (repo["id"], seen_github_ids),
            )
        else:
            cur.execute(
                """
                UPDATE issues
                SET state = 'closed', "updatedAt" = now()
                WHERE "repoId" = %s
                  AND state = 'open'
                """,
                (repo["id"],),
            )
        closed = cur.rowcount
        cur.close()
    return created, changed, closed


def sync_issues(repo_filter: str | None = None, classify_after_fetch: bool = True) -> dict[str, int]:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is required")
    page_size = min(int_from_env("ISSUE_FETCH_PAGE_SIZE", 50), 100)
    max_pages = int_from_env("ISSUE_FETCH_MAX_PAGES_PER_REPO", 3)
    stats = {"repos": 0, "created": 0, "changed": 0, "closed": 0, "fetched": 0}
    with psycopg2.connect(database_url) as conn, httpx.Client(headers=github_headers(), timeout=30) as github:
        repos = fetch_repos(conn, repo_filter)
        stats["repos"] = len(repos)
        for index, repo in enumerate(repos, start=1):
            log.info("[%s/%s] fetching issues for %s", index, len(repos), repo["fullName"])
            issues, complete_open_set = fetch_open_issues(
                github, repo["owner"], repo["name"], max_pages, page_size
            )
            activity_score, maintainer_score = calculate_repo_scores(issues, page_size)
            created, changed, closed = upsert_issues(conn, repo, issues, complete_open_set)
            cur = conn.cursor()
            cur.execute(
                'UPDATE repos SET "lastFetchedAt" = now(), "activityScore" = %s, "maintainerScore" = %s WHERE id = %s',
                (activity_score, maintainer_score, repo["id"]),
            )
            cur.close()
            conn.commit()
            stats["created"] += created
            stats["changed"] += changed
            stats["closed"] += closed
            stats["fetched"] += len(issues)
            time.sleep(0.3)
    if classify_after_fetch:
        classify_unclassified_issues()
    log.info("issue fetch complete: %s", stats)
    return stats


def main() -> None:
    sync_issues()


if __name__ == "__main__":
    main()
