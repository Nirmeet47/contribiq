# github data fetcher — talks to github's rest api using the user's oauth token
# uses httpx (async) instead of octokit since we're in python land
#
# KEY IMPROVEMENT over v1:
# instead of just reading repo.language (which only gives "TypeScript", "Python" etc.),
# we now fetch the actual dependency manifest from each repo:
#   - package.json        → node/js/ts projects
#   - requirements.txt    → python projects
#   - pyproject.toml      → modern python projects
#   - Cargo.toml          → rust projects
#   - go.mod              → go projects
#   - pubspec.yaml        → flutter/dart projects
#
# this gives groq real evidence: ["next", "react", "tailwindcss", "@prisma/client"]
# instead of just guessing from "TypeScript"

import os
import json
import base64
import asyncio
import logging
import tomllib
from typing import TypedDict

import httpx
import redis

logger = logging.getLogger("agent.github")

_redis = None

def _get_redis():
    global _redis
    if _redis is None:
        _redis = redis.from_url(os.environ["REDIS_URL"])
    return _redis

# bail at 4500 — github gives 5000/hr per token
RATE_LIMIT_THRESHOLD = 4500
GITHUB_API = "https://api.github.com"

# how many repos to fetch manifests for — we prioritise by most recently updated
# fetching all 100 would eat ~200 api calls just for manifests
MAX_REPOS_FOR_MANIFEST = 30


class RepoData(TypedDict):
    name: str
    full_name: str
    language: str | None
    description: str | None
    stars: int
    forks: int
    topics: list[str]
    dependencies: list[str]   # extracted from manifest files — the key new field


class GitHubData(TypedDict):
    repos: list[RepoData]
    languages: dict[str, int]  # language → repo count (kept for backwards compat)
    total_commits: int
    merged_prs: int
    username: str


def _decode_content(raw: str) -> str:
    """github returns file contents as base64 — decode it to a plain string."""
    return base64.b64decode(raw).decode("utf-8", errors="ignore")


def _extract_npm_deps(content: str) -> list[str]:
    """
    parse package.json and return all dependency names (prod + dev).
    we skip version strings — groq only needs the package name.
    ignores @types/* packages — those are just type definitions, not real skills.
    """
    try:
        pkg = json.loads(content)
    except json.JSONDecodeError:
        return []

    deps: dict = {}
    deps.update(pkg.get("dependencies", {}))
    deps.update(pkg.get("devDependencies", {}))
    deps.update(pkg.get("peerDependencies", {}))

    return [
        name for name in deps.keys()
        if not name.startswith("@types/")  # skip type stubs
        and not name.startswith("eslint")   # skip linting config packages
        and name not in ("typescript", "ts-node")  # language itself, not a skill
    ]


def _extract_pip_deps(content: str) -> list[str]:
    """
    parse requirements.txt — one package per line, strip version pins.
    e.g. "fastapi==0.115.0" → "fastapi"
         "torch>=2.0"       → "torch"
         "# comment"        → skip
    """
    deps = []
    for line in content.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        # strip version specifiers: ==, >=, <=, !=, ~=, >
        for sep in ("==", ">=", "<=", "!=", "~=", ">", "<", "["):
            line = line.split(sep)[0]
        name = line.strip()
        if name:
            deps.append(name)
    return deps


def _extract_pyproject_deps(content: str) -> list[str]:
    """
    parse pyproject.toml (PEP 518/621) — handles both [project.dependencies]
    and [tool.poetry.dependencies] formats.
    """
    try:
        data = tomllib.loads(content)
    except Exception:
        return []

    deps = []

    # PEP 621 format: [project] dependencies = ["fastapi>=0.100", ...]
    project_deps = data.get("project", {}).get("dependencies", [])
    for dep in project_deps:
        # strip version specifiers
        for sep in (">=", "<=", "==", "!=", "~=", ">", "<", "[", " "):
            dep = dep.split(sep)[0]
        if dep.strip():
            deps.append(dep.strip())

    # poetry format: [tool.poetry.dependencies] = {fastapi = "^0.100"}
    poetry_deps = data.get("tool", {}).get("poetry", {}).get("dependencies", {})
    for name in poetry_deps.keys():
        if name.lower() != "python":
            deps.append(name)

    return deps


def _extract_cargo_deps(content: str) -> list[str]:
    """
    parse Cargo.toml — rust crate dependencies.
    handles both [dependencies] and [dev-dependencies].
    """
    try:
        data = tomllib.loads(content)
    except Exception:
        return []

    deps = list(data.get("dependencies", {}).keys())
    deps += list(data.get("dev-dependencies", {}).keys())
    return deps


def _extract_go_deps(content: str) -> list[str]:
    """
    parse go.mod — extract require() block package paths.
    e.g. "github.com/gin-gonic/gin v1.9.0" → "gin-gonic/gin"
    """
    deps = []
    in_require = False
    for line in content.splitlines():
        line = line.strip()
        if line.startswith("require ("):
            in_require = True
            continue
        if in_require:
            if line == ")":
                in_require = False
                continue
            # line like: github.com/gin-gonic/gin v1.9.0
            parts = line.split()
            if parts:
                # take the last two path segments as the meaningful name
                path_parts = parts[0].split("/")
                if len(path_parts) >= 2:
                    deps.append("/".join(path_parts[-2:]))
                else:
                    deps.append(parts[0])
    return deps


def _extract_pubspec_deps(content: str) -> list[str]:
    """
    parse pubspec.yaml (flutter/dart) — very simple line-based extraction.
    full yaml parsing would need pyyaml but we want to keep deps minimal.
    """
    deps = []
    in_deps = False
    for line in content.splitlines():
        stripped = line.strip()
        if stripped in ("dependencies:", "dev_dependencies:"):
            in_deps = True
            continue
        if in_deps:
            # a new top-level section ends the deps block
            if line and not line.startswith(" ") and not line.startswith("\t"):
                in_deps = False
                continue
            # dep lines look like "  flutter: sdk: flutter" or "  provider: ^6.0.0"
            if ":" in stripped and not stripped.startswith("#"):
                name = stripped.split(":")[0].strip()
                if name and name != "flutter":
                    deps.append(name)
    return deps


async def _fetch_manifest(
    client: httpx.AsyncClient,
    full_name: str,
    redis_client,
    rate_key: str,
) -> list[str]:
    """
    try each manifest file in priority order and return extracted dependencies.
    stops at the first one found — a repo won't have both package.json and Cargo.toml.
    returns [] if none found or if we're close to the rate limit.
    """

    # check rate limit before spending more calls
    current = redis_client.get(rate_key)
    if current and int(current) >= RATE_LIMIT_THRESHOLD:
        logger.warning(f"rate limit close, skipping manifest for {full_name}")
        return []

    manifests = [
        ("package.json",      _extract_npm_deps),
        ("requirements.txt",  _extract_pip_deps),
        ("pyproject.toml",    _extract_pyproject_deps),
        ("Cargo.toml",        _extract_cargo_deps),
        ("go.mod",            _extract_go_deps),
        ("pubspec.yaml",      _extract_pubspec_deps),
    ]

    for filename, extractor in manifests:
        try:
            resp = await client.get(
                f"{GITHUB_API}/repos/{full_name}/contents/{filename}",
                timeout=10,
            )
            redis_client.incr(rate_key)  # count every api call

            if resp.status_code == 200:
                data = resp.json()
                raw_content = data.get("content", "")
                decoded = _decode_content(raw_content)
                deps = extractor(decoded)
                if deps:
                    logger.info(f"{full_name}: found {filename} with {len(deps)} deps")
                    return deps

        except Exception as e:
            logger.debug(f"{full_name}/{filename} fetch failed: {e}")
            continue

    return []  # no manifest found


async def get_github_data(user_id: str, token: str) -> GitHubData:
    """
    fetches the user's repos + extracts real dependencies from manifest files.
    the dependencies list is what groq uses to infer actual skills (React, FastAPI, etc.)
    rather than just the primary language.
    """

    rate_key = f"github:ratelimit:{user_id}"
    redis_client = _get_redis()

    current = redis_client.get(rate_key)
    if current and int(current) >= RATE_LIMIT_THRESHOLD:
        raise RuntimeError("RATE_LIMIT_EXCEEDED")

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
    }

    async with httpx.AsyncClient(headers=headers, timeout=30) as client:

        # -- fetch user info + repos + merged PRs in parallel --
        user_resp, repos_resp = await asyncio.gather(
            client.get(f"{GITHUB_API}/user"),
            client.get(f"{GITHUB_API}/user/repos", params={
                "visibility": "public",
                "per_page": 100,
                "sort": "updated",  # most recently active first
            }),
        )

        if user_resp.status_code == 401:
            raise RuntimeError("TOKEN_EXPIRED")
        user_resp.raise_for_status()
        repos_resp.raise_for_status()

        # count these api calls
        pipe = redis_client.pipeline()
        pipe.incrby(rate_key, 2)
        pipe.expire(rate_key, 3600)
        pipe.execute()

        user_data = user_resp.json()
        repos_data = repos_resp.json()
        username = user_data["login"]

        # -- merged PR count (1 api call) --
        pr_resp = await client.get(
            f"{GITHUB_API}/search/issues",
            params={"q": f"is:pr author:{username} is:merged", "per_page": 1},
        )
        redis_client.incr(rate_key)

        merged_prs = 0
        if pr_resp.status_code == 200:
            merged_prs = pr_resp.json().get("total_count", 0)

        # -- language frequency map (kept for backwards compat) --
        languages: dict[str, int] = {}
        for repo in repos_data:
            lang = repo.get("language")
            if lang:
                languages[lang] = languages.get(lang, 0) + 1

        # -- fetch manifests for the N most recently updated repos --
        # we cap at MAX_REPOS_FOR_MANIFEST to stay well within rate limits
        repos_for_manifest = repos_data[:MAX_REPOS_FOR_MANIFEST]

        # fetch manifests concurrently but with a small semaphore to avoid
        # hammering github with 30 simultaneous requests
        semaphore = asyncio.Semaphore(5)

        async def fetch_with_semaphore(repo):
            async with semaphore:
                deps = await _fetch_manifest(
                    client, repo["full_name"], redis_client, rate_key
                )
                # small delay between repos to be gentle
                await asyncio.sleep(0.1)
                return deps

        manifest_results = await asyncio.gather(
            *[fetch_with_semaphore(r) for r in repos_for_manifest]
        )

        # -- build the final repos list with dependencies attached --
        repos: list[RepoData] = []
        for i, r in enumerate(repos_data):
            deps = manifest_results[i] if i < len(manifest_results) else []
            repos.append(RepoData(
                name=r["name"],
                full_name=r["full_name"],
                language=r.get("language"),
                description=r.get("description"),
                stars=r.get("stargazers_count", 0),
                forks=r.get("forks_count", 0),
                topics=r.get("topics", []),
                dependencies=deps,
            ))

        # Replace the hardcoded estimate at the bottom of get_github_data:
        commit_resp = await client.get(
            f"{GITHUB_API}/search/commits",
            params={"q": f"author:{username}", "per_page": 1},
            headers={**headers, "Accept": "application/vnd.github.cloak-preview+json"},
        )
        redis_client.incr(rate_key)
        total_commits = commit_resp.json().get("total_count", 0) if commit_resp.status_code == 200 else len(repos_data) * 15

        return GitHubData(
            repos=repos,
            languages=languages,
            total_commits=total_commits,
            merged_prs=merged_prs,
            username=username,
        )