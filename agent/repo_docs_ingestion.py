import argparse
import base64
import hashlib
import json
import logging
import os
import re
import time
from pathlib import Path
from typing import Any
from urllib.parse import quote

import httpx
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from google import genai

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("repo_docs_ingestion")

GITHUB_API_VERSION = "2022-11-28"
DOC_PATHS = ("README.md", "CONTRIBUTING.md")
MAX_DOC_FILES_PER_REPO = int(os.getenv("REPO_DOCS_MAX_FILES", "18"))
MAX_DOC_BYTES = int(os.getenv("REPO_DOCS_MAX_BYTES", str(220_000)))
EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_DIMENSIONS = 768
CHUNK_TOKENS = 500
CHUNK_OVERLAP = 50
FETCH_FAILED = object()

DOC_FILE_NAMES = {
    "readme",
    "contributing",
    "contribution",
    "code_of_conduct",
    "security",
    "support",
    "governance",
    "architecture",
    "design",
    "roadmap",
    "changelog",
    "license",
    "getting-started",
    "quickstart",
    "development",
    "install",
    "setup",
    "testing",
    "deployment",
    "configuration",
    "troubleshooting",
}
DOC_EXTENSIONS = {".md", ".mdx", ".rst", ".txt", ".adoc"}
CONFIG_FILE_NAMES = {
    "package.json",
    "pyproject.toml",
    "requirements.txt",
    "cargo.toml",
    "go.mod",
    "pubspec.yaml",
    "composer.json",
    "gemfile",
    "dockerfile",
    "docker-compose.yml",
    "makefile",
}
HIGH_SIGNAL_DIRS = {
    ".github",
    "docs",
    "doc",
    "documentation",
    "guides",
    "guide",
    "examples",
    "example",
    "config",
    "configs",
}
SKIP_PATH_PARTS = {
    ".git",
    ".next",
    ".turbo",
    "node_modules",
    "vendor",
    "dist",
    "build",
    "coverage",
    "__pycache__",
    ".venv",
    "venv",
}


class QuotaExhausted(Exception):
    pass


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


def gemini_client() -> genai.Client:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is required")
    return genai.Client(api_key=api_key)


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
        cur.execute(
            '''
            SELECT id, owner, name, "fullName"
            FROM repos
            WHERE "indexingStatus" = 'PENDING'
            ORDER BY
              "createdAt"
            '''
        )
        pending_repos = cur.fetchall()
        if pending_repos:
            cur.close()
            return pending_repos

        cur.execute(
            '''
            SELECT id, owner, name, "fullName"
            FROM repos
            ORDER BY "createdAt"
            '''
        )
    repos = cur.fetchall()
    cur.close()
    return repos


def update_repo_indexing_status(
    conn,
    repo_id: str,
    status: str,
    error: str | None = None,
) -> None:
    cur = conn.cursor()
    if status == "INDEXED":
        cur.execute(
            '''
            UPDATE repos
            SET "indexingStatus" = 'INDEXED',
                "lastIndexedAt" = now(),
                "indexingError" = NULL,
                "updatedAt" = now()
            WHERE id = %s
            ''',
            (repo_id,),
        )
    elif status == "FAILED":
        cur.execute(
            '''
            UPDATE repos
            SET "indexingStatus" = 'FAILED',
                "indexingError" = %s,
                "updatedAt" = now()
            WHERE id = %s
            ''',
            ((error or "Repo docs ingestion failed")[:2000], repo_id),
        )
    elif status == "PENDING":
        cur.execute(
            '''
            UPDATE repos
            SET "indexingStatus" = 'PENDING',
                "indexingError" = NULL,
                "updatedAt" = now()
            WHERE id = %s
            ''',
            (repo_id,),
        )
    cur.close()
    conn.commit()


def fetch_doc(client: httpx.Client, owner: str, repo: str, path: str) -> tuple[str, str] | None | object:
    url = f"https://api.github.com/repos/{owner}/{repo}/contents/{path}"
    try:
        response = client.get(url, timeout=20)
        if response.status_code == 404:
            return None
        if response.status_code in (403, 429):
            log.warning("%s/%s %s rate limited, waiting 60s", owner, repo, path)
            time.sleep(60)
            return FETCH_FAILED
        response.raise_for_status()
        encoded = response.json().get("content")
        if not encoded:
            return None
        raw_content = base64.b64decode(encoded)
        if len(raw_content) > MAX_DOC_BYTES:
            log.info("%s/%s %s too large, skipping", owner, repo, path)
            return None
        raw_hash = hashlib.sha256(raw_content).hexdigest()
        return raw_content.decode("utf-8", errors="replace"), raw_hash
    except Exception as exc:
        log.warning("%s/%s %s fetch failed: %s", owner, repo, path, exc)
        return FETCH_FAILED


def fetch_default_branch(client: httpx.Client, owner: str, repo: str) -> str | object:
    url = f"https://api.github.com/repos/{owner}/{repo}"
    try:
        response = client.get(url, timeout=20)
        if response.status_code in (403, 429):
            log.warning("%s/%s metadata rate limited, waiting 60s", owner, repo)
            time.sleep(60)
            return FETCH_FAILED
        if response.status_code == 404:
            return "main"
        response.raise_for_status()
        branch = response.json().get("default_branch")
        return branch if isinstance(branch, str) and branch else "main"
    except Exception as exc:
        log.warning("%s/%s metadata fetch failed: %s", owner, repo, exc)
        return FETCH_FAILED


def fetch_repo_tree(client: httpx.Client, owner: str, repo: str) -> list[dict[str, Any]] | object:
    default_branch = fetch_default_branch(client, owner, repo)
    if default_branch is FETCH_FAILED:
        return FETCH_FAILED

    branch_ref = quote(str(default_branch), safe="")
    url = f"https://api.github.com/repos/{owner}/{repo}/git/trees/{branch_ref}?recursive=1"
    try:
        response = client.get(url, timeout=30)
        if response.status_code in (403, 429):
            log.warning("%s/%s tree rate limited, waiting 60s", owner, repo)
            time.sleep(60)
            return FETCH_FAILED
        if response.status_code == 404:
            return []
        response.raise_for_status()
        payload = response.json()
        if payload.get("truncated"):
            log.info("%s/%s tree is truncated; using returned high-signal paths", owner, repo)
        tree = payload.get("tree")
        return tree if isinstance(tree, list) else []
    except Exception as exc:
        log.warning("%s/%s tree fetch failed: %s", owner, repo, exc)
        return FETCH_FAILED


def normalize_path(path: str) -> str:
    return path.replace("\\", "/").strip("/")


def is_skipped_path(path: str) -> bool:
    parts = {part.lower() for part in normalize_path(path).split("/")}
    return bool(parts & SKIP_PATH_PARTS)


def doc_priority(path: str, size: int | None = None) -> int | None:
    normalized = normalize_path(path)
    if not normalized or is_skipped_path(normalized):
        return None
    if size is not None and size > MAX_DOC_BYTES:
        return None

    parts = normalized.split("/")
    lower_parts = [part.lower() for part in parts]
    filename = lower_parts[-1]
    stem, extension = os.path.splitext(filename)
    parent_dirs = set(lower_parts[:-1])
    root_file = len(parts) == 1

    if filename in CONFIG_FILE_NAMES:
        return 10 if root_file else 70
    if root_file and stem in DOC_FILE_NAMES and extension in DOC_EXTENSIONS:
        return 20
    if lower_parts[0] == ".github" and extension in DOC_EXTENSIONS:
        return 30
    if parent_dirs & {"docs", "doc", "documentation"} and extension in DOC_EXTENSIONS:
        return 40
    if parent_dirs & {"guides", "guide", "examples", "example"} and extension in DOC_EXTENSIONS:
        return 55
    if parent_dirs & HIGH_SIGNAL_DIRS and extension in DOC_EXTENSIONS:
        return 65
    if stem in DOC_FILE_NAMES and extension in DOC_EXTENSIONS:
        return 75
    return None


def discover_doc_paths(client: httpx.Client, owner: str, repo: str) -> list[str] | object:
    tree = fetch_repo_tree(client, owner, repo)
    if tree is FETCH_FAILED:
        return FETCH_FAILED

    candidates: list[tuple[int, str]] = []
    for item in tree:
        if item.get("type") != "blob":
            continue
        path = item.get("path")
        if not isinstance(path, str):
            continue
        priority = doc_priority(path, item.get("size") if isinstance(item.get("size"), int) else None)
        if priority is not None:
            candidates.append((priority, normalize_path(path)))

    ordered_paths = [path for _, path in sorted(set(candidates), key=lambda item: (item[0], item[1].lower()))]
    for fallback in reversed(DOC_PATHS):
        if fallback not in ordered_paths:
            ordered_paths.insert(0, fallback)
    return ordered_paths[:MAX_DOC_FILES_PER_REPO]


def existing_content_hash(conn, repo_id: str, path: str) -> str | None:
    cur = conn.cursor()
    cur.execute(
        '''
        SELECT "contentHash"
        FROM repo_docs
        WHERE "repoId" = %s AND "filePath" = %s
        LIMIT 1
        ''',
        (repo_id, path),
    )
    row = cur.fetchone()
    cur.close()
    return row[0] if row else None


def delete_doc_chunks(conn, repo_id: str, path: str) -> None:
    cur = conn.cursor()
    cur.execute(
        '''
        DELETE FROM repo_docs
        WHERE "repoId" = %s AND "filePath" = %s
        ''',
        (repo_id, path),
    )
    cur.close()


def chunk_document(path: str, text: str) -> list[str]:
    words = re.findall(r"\S+", text)
    if not words:
        return []
    chunks = []
    step = CHUNK_TOKENS - CHUNK_OVERLAP
    for start in range(0, len(words), step):
        segment = words[start : start + CHUNK_TOKENS]
        if not segment:
            break
        chunks.append(f"{path}\n\n{' '.join(segment)}")
        if start + CHUNK_TOKENS >= len(words):
            break
    return chunks


def embed(client: genai.Client, text: str) -> list[float] | None:
    try:
        response = client.models.embed_content(
            model=EMBEDDING_MODEL,
            contents=text,
            config={"output_dimensionality": EMBEDDING_DIMENSIONS},
        )
        return response.embeddings[0].values
    except Exception as exc:
        message = str(exc)
        if "RESOURCE_EXHAUSTED" in message or "429" in message:
            raise QuotaExhausted(message) from exc
        log.warning("embed failed: %s", exc)
        return None


def insert_chunk(
    conn,
    repo_id: str,
    path: str,
    doc_hash: str,
    chunk_index: int,
    chunk_text: str,
    embedding: list[float],
) -> None:
    cur = conn.cursor()
    cur.execute(
        '''
        INSERT INTO repo_docs (
            id, "repoId", "filePath", "contentHash", "chunkIndex",
            "chunkText", embedding, "updatedAt"
        )
        VALUES (
            gen_random_uuid()::text, %s, %s, %s, %s,
            %s, %s::vector, now()
        )
        ON CONFLICT ("repoId", "filePath", "chunkIndex") DO UPDATE SET
            "contentHash" = EXCLUDED."contentHash",
            "chunkText" = EXCLUDED."chunkText",
            embedding = EXCLUDED.embedding,
            "updatedAt" = now()
        ''',
        (repo_id, path, doc_hash, chunk_index, chunk_text, json.dumps(embedding)),
    )
    cur.close()


def ingest_doc(
    conn,
    embedder: genai.Client,
    repo: dict[str, Any],
    path: str,
    document: tuple[str, str] | None | object,
) -> tuple[bool, int]:
    repo_id = repo["id"]
    if document is FETCH_FAILED:
        log.info("%s fetch failed, leaving existing chunks unchanged", path)
        return False, 0
    if document is None:
        if existing_content_hash(conn, repo_id, path):
            delete_doc_chunks(conn, repo_id, path)
            conn.commit()
            log.info("%s missing upstream; deleted old chunks", path)
            return True, 0
        log.info("%s missing, skipping", path)
        return False, 0
    content, doc_hash = document
    if existing_content_hash(conn, repo_id, path) == doc_hash:
        log.info("%s unchanged, skipping", path)
        return False, 0
    chunks = chunk_document(path, content)
    if not chunks:
        if existing_content_hash(conn, repo_id, path):
            delete_doc_chunks(conn, repo_id, path)
            conn.commit()
            log.info("%s empty after chunking; deleted old chunks", path)
            return True, 0
        return False, 0

    vectors: list[list[float]] = []
    for chunk_index, chunk in enumerate(chunks):
        vector = embed(embedder, chunk)
        if vector is None:
            raise RuntimeError(f"{path} chunk {chunk_index + 1}/{len(chunks)} embedding failed")
        vectors.append(vector)
        time.sleep(0.1)

    delete_doc_chunks(conn, repo_id, path)
    for chunk_index, (chunk, vector) in enumerate(zip(chunks, vectors)):
        insert_chunk(conn, repo_id, path, doc_hash, chunk_index, chunk, vector)
    conn.commit()
    log.info("%s wrote %s chunks", path, len(chunks))
    return True, len(chunks)


def ingest_repo(conn, github: httpx.Client, embedder: genai.Client, repo: dict[str, Any], index: int, total: int) -> tuple[bool, int]:
    log.info("[%s/%s] %s", index, total, repo["fullName"])
    changed = False
    total_chunks = 0
    update_repo_indexing_status(conn, repo["id"], "PENDING")
    doc_paths = discover_doc_paths(github, repo["owner"], repo["name"])
    if doc_paths is FETCH_FAILED:
        raise RuntimeError("repository file discovery failed")
    log.info("selected %s knowledge files: %s", len(doc_paths), ", ".join(doc_paths))
    for path in doc_paths:
        document = fetch_doc(github, repo["owner"], repo["name"], path)
        if document is FETCH_FAILED:
            raise RuntimeError(f"{path} fetch failed")
        doc_changed, inserted = ingest_doc(conn, embedder, repo, path, document)
        changed = changed or doc_changed
        total_chunks += inserted
    update_repo_indexing_status(conn, repo["id"], "INDEXED")
    return changed, total_chunks


def ingest_repo_docs(repo_filter: str | None = None) -> dict[str, int | bool]:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is required")
    changed = 0
    chunks = 0
    stopped_early = False
    with (
        psycopg2.connect(database_url) as conn,
        httpx.Client(headers=github_headers(), timeout=30) as github,
    ):
        embedder = gemini_client()
        repos = fetch_repos(conn, repo_filter)
        log.info("found %s repos to check", len(repos))
        for index, repo in enumerate(repos, start=1):
            try:
                repo_changed, inserted = ingest_repo(conn, github, embedder, repo, index, len(repos))
            except QuotaExhausted as exc:
                log.warning("Gemini quota exhausted: %s", exc)
                update_repo_indexing_status(conn, repo["id"], "FAILED", str(exc))
                stopped_early = True
                break
            except Exception as exc:
                log.warning("%s docs ingestion failed: %s", repo["fullName"], exc)
                update_repo_indexing_status(conn, repo["id"], "FAILED", str(exc))
                continue
            if repo_changed:
                changed += 1
            chunks += inserted
            time.sleep(0.3)
    result = {"repos_changed": changed, "chunks": chunks, "stopped_early": stopped_early}
    log.info("repo docs ingestion complete: %s", result)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest repo docs into pgvector")
    parser.add_argument("--repo", help="Optional repo id or fullName")
    args = parser.parse_args()
    ingest_repo_docs(args.repo)


if __name__ == "__main__":
    main()
