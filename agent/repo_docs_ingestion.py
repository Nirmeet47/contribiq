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
EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_DIMENSIONS = 768
CHUNK_TOKENS = 500
CHUNK_OVERLAP = 50
FETCH_FAILED = object()


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
            ORDER BY "createdAt"
            '''
        )
    repos = cur.fetchall()
    cur.close()
    return repos


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
        raw_hash = hashlib.sha256(raw_content).hexdigest()
        return raw_content.decode("utf-8", errors="replace"), raw_hash
    except Exception as exc:
        log.warning("%s/%s %s fetch failed: %s", owner, repo, path, exc)
        return FETCH_FAILED


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
            log.warning("%s chunk %s/%s failed; old chunks stay intact", path, chunk_index + 1, len(chunks))
            return False, 0
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
    for path in DOC_PATHS:
        document = fetch_doc(github, repo["owner"], repo["name"], path)
        doc_changed, inserted = ingest_doc(conn, embedder, repo, path, document)
        changed = changed or doc_changed
        total_chunks += inserted
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
                stopped_early = True
                break
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
