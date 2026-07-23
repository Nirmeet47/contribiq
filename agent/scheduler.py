import logging
import os
import time
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Callable

from agent.repo_discovery import discover
from agent.repo_docs_ingestion import ingest_repo_docs
from agent.contribution_summary import process_pending_contributions
from agent.issue_classifier import classify_unclassified_issues
from agent.issue_fetcher import sync_issues
from agent.match_scoring import score_matches

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("agent_scheduler")


def int_from_env(name: str, fallback: int) -> int:
    raw = os.getenv(name)
    if not raw:
        return fallback
    try:
        value = int(raw)
        return value if value > 0 else fallback
    except ValueError:
        return fallback


@dataclass
class ScheduledJob:
    name: str
    interval_seconds: int
    run: Callable[[], object]
    next_run_at: datetime


def run_job(job: ScheduledJob) -> None:
    started = datetime.now()
    log.info("starting %s", job.name)
    try:
        result = job.run()
        log.info("finished %s: %s", job.name, result)
    except Exception:
        log.exception("%s failed", job.name)
    finally:
        job.next_run_at = started + timedelta(seconds=job.interval_seconds)


def main() -> None:
    discovery_hours = int_from_env("REPO_DISCOVERY_INTERVAL_HOURS", 24)
    docs_hours = int_from_env("REPO_DOCS_INGEST_INTERVAL_HOURS", 12)
    issue_fetch_hours = int_from_env("ISSUE_FETCH_INTERVAL_HOURS", 6)
    issue_classify_hours = int_from_env("ISSUE_CLASSIFY_INTERVAL_HOURS", 1)
    match_scoring_hours = int_from_env("MATCH_SCORING_INTERVAL_HOURS", 6)
    contribution_minutes = int_from_env("CONTRIBUTION_SUMMARY_INTERVAL_MINUTES", 5)
    run_on_start = os.getenv("AI_SCHEDULER_RUN_ON_START", "true").lower() != "false"
    now = datetime.now()
    jobs = [
        ScheduledJob("repo_docs_ingestion", docs_hours * 3600, ingest_repo_docs, now),
        ScheduledJob("repo_discovery", discovery_hours * 3600, discover, now),
        ScheduledJob("issue_fetch", issue_fetch_hours * 3600, lambda: sync_issues(classify_after_fetch=True), now),
        ScheduledJob("issue_classification", issue_classify_hours * 3600, classify_unclassified_issues, now),
        ScheduledJob("match_scoring", match_scoring_hours * 3600, score_matches, now),
        ScheduledJob("contribution_summary", contribution_minutes * 60, process_pending_contributions, now),
    ]
    if not run_on_start:
        for job in jobs:
            job.next_run_at = now + timedelta(seconds=job.interval_seconds)

    log.info("python AI scheduler started with %s job(s)", len(jobs))
    while True:
        now = datetime.now()
        due = [job for job in jobs if job.next_run_at <= now]
        if due:
            for job in due:
                run_job(job)
            continue
        sleep_seconds = max(min((job.next_run_at - now).total_seconds() for job in jobs), 1)
        time.sleep(min(sleep_seconds, 60))


if __name__ == "__main__":
    main()
