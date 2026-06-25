# github data fetcher — talks to github's rest api using the user's oauth token
# uses httpx (async) instead of octokit since we're in python land
# includes a redis counter so we don't blow past github's 5k/hr rate limit

import os
import asyncio
import logging
from typing import TypedDict

import httpx
import redis

logger = logging.getLogger("agent.github")

# redis is lazy-loaded so it doesn't crash at import time (before dotenv runs)
_redis = None

def _get_redis():
    global _redis
    if _redis is None:
        _redis = redis.from_url(os.environ["REDIS_URL"])
    return _redis

# we bail at 4500 to leave headroom — github gives 5000/hr
RATE_LIMIT_THRESHOLD = 4500

GITHUB_API = "https://api.github.com"


class GitHubData(TypedDict):
    repos: list[dict]
    languages: dict[str, int]
    total_commits: int
    merged_prs: int
    username: str


async def get_github_data(user_id: str, token: str) -> GitHubData:
    """
    fetches the user's public repos, language stats, and merged PR count.
    raises if we're over the rate limit or the token is dead.
    """

    # check the counter before we waste a request
    rate_key = f"github:ratelimit:{user_id}"
    current = _get_redis().get(rate_key)
    if current and int(current) >= RATE_LIMIT_THRESHOLD:
        raise RuntimeError("RATE_LIMIT_EXCEEDED")

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
    }

    async with httpx.AsyncClient(headers=headers, timeout=30) as client:
        # fire both requests at the same time — no reason to wait sequentially
        user_resp, repos_resp = await asyncio.gather(
            client.get(f"{GITHUB_API}/user"),
            client.get(f"{GITHUB_API}/user/repos", params={
                "visibility": "public",
                "per_page": 100,
                "sort": "updated",
            }),
        )

        if user_resp.status_code == 401:
            raise RuntimeError("TOKEN_EXPIRED")
        user_resp.raise_for_status()
        repos_resp.raise_for_status()

        # bump the counter by 2 (we just made 2 api calls)
        pipe = _get_redis().pipeline()
        pipe.incrby(rate_key, 2)
        pipe.expire(rate_key, 3600)  # expires in 1 hour
        pipe.execute()

        user_data = user_resp.json()
        repos_data = repos_resp.json()
        username = user_data["login"]

        # count how many repos use each language
        languages: dict[str, int] = {}
        for repo in repos_data:
            lang = repo.get("language")
            if lang:
                languages[lang] = languages.get(lang, 0) + 1

        # search for merged PRs by this user
        pr_resp = await client.get(
            f"{GITHUB_API}/search/issues",
            params={"q": f"is:pr author:{username} is:merged", "per_page": 1},
        )

        # one more api call
        _get_redis().incr(rate_key)

        merged_prs = 0
        if pr_resp.status_code == 200:
            merged_prs = pr_resp.json().get("total_count", 0)

        # shape repos into something cleaner for the profiler
        repos = [
            {
                "name": r["name"],
                "full_name": r["full_name"],
                "language": r.get("language"),
                "stars": r.get("stargazers_count", 0),
                "forks": r.get("forks_count", 0),
                "description": r.get("description"),
            }
            for r in repos_data
        ]

        # rough commit estimate — fetching exact counts per-repo would eat the rate limit
        total_commits = len(repos_data) * 15

        return GitHubData(
            repos=repos,
            languages=languages,
            total_commits=total_commits,
            merged_prs=merged_prs,
            username=username,
        )
