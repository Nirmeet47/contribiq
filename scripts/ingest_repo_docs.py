# scripts/ingest_repo_docs.py
#
# Ingests README.md and CONTRIBUTING.md into repo_docs pgvector chunks.
#
# Run: python scripts/ingest_repo_docs.py
#      python scripts/ingest_repo_docs.py --repo vercel/next.js
# Needs: GITHUB_TOKEN, GEMINI_API_KEY, DATABASE_URL in .env
#
# Safe to re-run. Unchanged docs are skipped by sha256 content hash.
# A doc's hash is only ever recorded once ALL of its chunks embed
# successfully — so a run that gets rate-limited partway through never
# marks a doc "done" with missing chunks. If Gemini's quota runs out,
# the whole run stops immediately (no point burning GitHub calls on
# the remaining repos) and the *next* run picks up exactly where this
# one left off, since already-completed repos are skipped by hash
# in a couple of cheap DB lookups.

import argparse
import base64
import hashlib
import json
import logging
import os
import re
import time

import httpx
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from google import genai

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("repo-docs")

GITHUB_TOKEN = os.environ["GITHUB_TOKEN"]
GEMINI_API_KEY = os.environ["GEMINI_API_KEY"]
DATABASE_URL = os.environ["DATABASE_URL"]

GITHUB_HEADERS = {
    "Authorization": f"Bearer {GITHUB_TOKEN}",
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
}

DOC_PATHS = ("README.md", "CONTRIBUTING.md")
EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_DIMENSIONS = 768
CHUNK_TOKENS = 500
CHUNK_OVERLAP = 50
FETCH_FAILED = object()

genai_client = genai.Client(api_key=GEMINI_API_KEY)


class QuotaExhausted(Exception):
    """Raised when the Gemini API reports quota/rate-limit exhaustion.
    Propagates all the way up to main() to stop the run immediately —
    every remaining embed call this run would just fail the same way."""
    pass


def fetch_repos(conn, repo_filter: str | None = None) -> list[dict]:
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


def fetch_doc(owner: str, repo: str, path: str) -> tuple[str, str] | None | object:
    url = f"https://api.github.com/repos/{owner}/{repo}/contents/{path}"

    try:
        response = httpx.get(url, headers=GITHUB_HEADERS, timeout=20)
        if response.status_code == 404:
            return None
        if response.status_code == 403:
            log.warning(f"  {owner}/{repo} {path} rate limited, waiting 60s")
            time.sleep(60)
            return FETCH_FAILED

        response.raise_for_status()
        payload = response.json()
        encoded = payload.get("content")
        if not encoded:
            return None

        raw_content = base64.b64decode(encoded)
        raw_hash = hashlib.sha256(raw_content).hexdigest()
        return raw_content.decode("utf-8", errors="replace"), raw_hash

    except Exception as e:
        log.warning(f"  {owner}/{repo} {path} fetch failed: {e}")
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


def embed(text: str) -> list[float]:
    """Returns the embedding vector, or raises QuotaExhausted if Gemini's
    quota is exceeded. Other transient errors return None so the caller
    can decide whether to abandon the whole doc for this run."""
    try:
        response = genai_client.models.embed_content(
            model=EMBEDDING_MODEL,
            contents=text,
            config={"output_dimensionality": EMBEDDING_DIMENSIONS},
        )
        return response.embeddings[0].values
    except Exception as e:
        message = str(e)
        if "RESOURCE_EXHAUSTED" in message or "429" in message:
            raise QuotaExhausted(message) from e
        log.warning(f"    embed failed: {e}")
        return None


def vector_literal(values: list[float]) -> str:
    return json.dumps(values)


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
        (repo_id, path, doc_hash, chunk_index, chunk_text, vector_literal(embedding)),
    )
    cur.close()


def ingest_doc(
    conn, repo: dict, path: str, document: tuple[str, str] | None | object
) -> tuple[bool, int]:
    """Returns (changed, chunks_written). Never writes a partial doc —
    either every chunk embeds successfully and the doc is fully
    replaced, or nothing is touched and this doc stays 'pending' for
    the next run. QuotaExhausted propagates up uncaught, which stops
    the whole script."""
    repo_id = repo["id"]

    if document is FETCH_FAILED:
        log.info(f"  {path} fetch failed, leaving existing chunks unchanged")
        return False, 0

    if document is None:
        if existing_content_hash(conn, repo_id, path):
            delete_doc_chunks(conn, repo_id, path)
            conn.commit()
            log.info(f"  {path} missing upstream; deleted old chunks")
            return True, 0
        log.info(f"  {path} missing, skipping")
        return False, 0

    content, doc_hash = document
    if existing_content_hash(conn, repo_id, path) == doc_hash:
        log.info(f"  {path} unchanged, skipping")
        return False, 0

    chunks = chunk_document(path, content)
    if not chunks:
        if existing_content_hash(conn, repo_id, path):
            delete_doc_chunks(conn, repo_id, path)
            conn.commit()
            log.info(f"  {path} empty after chunking; deleted old chunks")
            return True, 0
        log.info(f"  {path} empty after chunking, skipping")
        return False, 0

    # Embed every chunk BEFORE touching the DB. If any chunk fails
    # (for a non-quota reason), abandon this doc entirely for now —
    # old chunks stay untouched and the doc is retried whole next run.
    vectors: list[list[float]] = []
    for chunk_index, chunk in enumerate(chunks):
        vector = embed(chunk)  # raises QuotaExhausted on 429 — let it propagate
        if vector is None:
            log.warning(
                f"  {path} chunk {chunk_index + 1}/{len(chunks)} failed to embed; "
                f"leaving existing chunks untouched, will retry this doc next run"
            )
            return False, 0
        vectors.append(vector)
        log.info(f"    {path}: embedded {chunk_index + 1}/{len(chunks)} chunks")
        time.sleep(0.1)

    # All chunks embedded successfully — now it's safe to replace atomically.
    delete_doc_chunks(conn, repo_id, path)
    for chunk_index, (chunk, vector) in enumerate(zip(chunks, vectors)):
        insert_chunk(conn, repo_id, path, doc_hash, chunk_index, chunk, vector)
    conn.commit()

    log.info(f"  {path} wrote {len(chunks)}/{len(chunks)} chunks")
    return True, len(chunks)


def ingest_repo(conn, repo: dict, index: int, total: int) -> tuple[bool, int]:
    owner, name = repo["owner"], repo["name"]
    log.info(f"[{index}/{total}] {repo['fullName']}")

    changed = False
    total_chunks = 0
    for path in DOC_PATHS:
        content = fetch_doc(owner, name, path)
        doc_changed, inserted = ingest_doc(conn, repo, path, content)
        changed = changed or doc_changed
        total_chunks += inserted

    return changed, total_chunks


def main():
    parser = argparse.ArgumentParser(description="Ingest repo docs into pgvector")
    parser.add_argument(
        "--repo",
        help="Optional repo id or fullName (for example vercel/next.js) to ingest",
    )
    args = parser.parse_args()

    log.info("=" * 55)
    log.info("ContribIQ repo docs ingester")
    log.info("=" * 55)

    conn = psycopg2.connect(DATABASE_URL)

    changed = 0
    chunks = 0
    stopped_early = False

    try:
        repos = fetch_repos(conn, args.repo)
        log.info(f"Found {len(repos)} repos to check")

        for i, repo in enumerate(repos):
            try:
                repo_changed, inserted = ingest_repo(conn, repo, i + 1, len(repos))
            except QuotaExhausted as e:
                remaining = len(repos) - i
                log.warning("-" * 55)
                log.warning(f"Gemini quota exhausted: {e}")
                log.warning(
                    f"Stopping here — {remaining} repo(s) not yet checked "
                    f"(starting from [{i + 1}/{len(repos)}] {repo['fullName']})."
                )
                log.warning(
                    "Just run this script again once quota resets — completed "
                    "repos are skipped automatically and it'll resume from here."
                )
                log.warning("-" * 55)
                stopped_early = True
                break

            if repo_changed:
                changed += 1
            chunks += inserted
            time.sleep(0.3)

        if not stopped_early:
            log.info(
                f"\nDone - {changed}/{len(repos)} repos changed, {chunks} chunks written\n"
            )

    finally:
        conn.close()

    log.info("=" * 55)
    if stopped_early:
        log.info("Repo docs ingestion paused (quota exhausted) — rerun to resume")
    else:
        log.info("Repo docs ingestion complete")
    log.info("=" * 55)


if __name__ == "__main__":
    main()