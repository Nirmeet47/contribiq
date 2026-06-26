# scripts/ingest_repo_docs.py
#
# Builds per-repo FAISS indexes from README.md and CONTRIBUTING.md.
#
# Run: python scripts/ingest_repo_docs.py
# Needs: GITHUB_TOKEN, GEMINI_API_KEY, DATABASE_URL in .env
#
# Safe to re-run for repos whose faiss index path is still null.

import base64
import json
import logging
import os
import re
import time

import faiss
import httpx
import numpy as np
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
FAISS_DIR = "/data/faiss"
EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_DIMENSIONS = 768
CHUNK_TOKENS = 500
CHUNK_OVERLAP = 50

genai_client = genai.Client(api_key=GEMINI_API_KEY)


def resolve_faiss_column(conn) -> str:
    cur = conn.cursor()
    cur.execute(
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'repos'
          AND column_name IN ('faiss_index_path', 'faissIndexPath')
        """
    )
    columns = {row[0] for row in cur.fetchall()}
    cur.close()

    if "faiss_index_path" in columns:
        return "faiss_index_path"
    if "faissIndexPath" in columns:
        return "faissIndexPath"
    raise RuntimeError("repos table has no FAISS index path column")


def fetch_repos(conn, faiss_column: str) -> list[dict]:
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        f'''
        SELECT id, owner, name, "fullName"
        FROM repos
        WHERE "{faiss_column}" IS NULL
        ORDER BY "createdAt"
        '''
    )
    repos = cur.fetchall()
    cur.close()
    return repos


def fetch_doc(owner: str, repo: str, path: str) -> str | None:
    url = f"https://api.github.com/repos/{owner}/{repo}/contents/{path}"

    try:
        response = httpx.get(url, headers=GITHUB_HEADERS, timeout=20)
        if response.status_code == 404:
            return None
        if response.status_code == 403:
            log.warning(f"  {owner}/{repo} {path} rate limited, waiting 60s")
            time.sleep(60)
            return None

        response.raise_for_status()
        payload = response.json()
        encoded = payload.get("content")
        if not encoded:
            return None

        return base64.b64decode(encoded).decode("utf-8", errors="replace")

    except Exception as e:
        log.warning(f"  {owner}/{repo} {path} fetch failed: {e}")
        return None


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


def embed_chunk(text: str) -> list[float] | None:
    try:
        response = genai_client.models.embed_content(
            model=EMBEDDING_MODEL,
            contents=text,
            config={"output_dimensionality": EMBEDDING_DIMENSIONS},
        )
        return response.embeddings[0].values
    except Exception as e:
        log.warning(f"    embed failed: {e}")
        return None


def normalize_rows(vectors: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return vectors / norms


def safe_index_name(owner: str, repo: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]+", "-", f"{owner}-{repo}")


def write_index(owner: str, repo: str, chunks: list[str], vectors: list[list[float]]) -> str:
    os.makedirs(FAISS_DIR, exist_ok=True)

    matrix = np.array(vectors, dtype="float32")
    matrix = normalize_rows(matrix)

    index = faiss.IndexFlatIP(EMBEDDING_DIMENSIONS)
    index.add(matrix)

    base_name = safe_index_name(owner, repo)
    index_path = os.path.join(FAISS_DIR, f"{base_name}.index")
    chunks_path = os.path.join(FAISS_DIR, f"{base_name}.chunks.json")

    faiss.write_index(index, index_path)
    with open(chunks_path, "w", encoding="utf-8") as f:
        json.dump(chunks, f, ensure_ascii=False, indent=2)

    return index_path


def update_repo_index_path(conn, repo_id: str, faiss_column: str, index_path: str) -> None:
    cur = conn.cursor()
    cur.execute(
        f'''
        UPDATE repos
        SET "{faiss_column}" = %s,
            "updatedAt" = now()
        WHERE id = %s
        ''',
        (index_path, repo_id),
    )
    conn.commit()
    cur.close()


def ingest_repo(conn, repo: dict, faiss_column: str, index: int, total: int) -> bool:
    owner, name = repo["owner"], repo["name"]
    log.info(f"[{index}/{total}] {repo['fullName']}")

    documents = []
    for path in DOC_PATHS:
        content = fetch_doc(owner, name, path)
        if content:
            documents.append((path, content))

    if not documents:
        log.info(f"  {owner}/{name} README.md and CONTRIBUTING.md both missing, skipping")
        return False

    chunks = []
    for path, content in documents:
        chunks.extend(chunk_document(path, content))

    if not chunks:
        log.info(f"  {owner}/{name} docs were empty after chunking, skipping")
        return False

    vectors = []
    kept_chunks = []
    for i, chunk in enumerate(chunks):
        vector = embed_chunk(chunk)
        if vector:
            vectors.append(vector)
            kept_chunks.append(chunk)
        log.info(f"    embedded {i + 1}/{len(chunks)} chunks")
        time.sleep(0.1)

    if not vectors:
        log.warning(f"  {owner}/{name} produced no embeddings, skipping")
        return False

    index_path = write_index(owner, name, kept_chunks, vectors)
    update_repo_index_path(conn, repo["id"], faiss_column, index_path)

    log.info(f"  wrote {len(kept_chunks)} chunks to {index_path}")
    return True


def main():
    log.info("=" * 55)
    log.info("ContribIQ repo docs ingester")
    log.info("=" * 55)

    conn = psycopg2.connect(DATABASE_URL)

    try:
        faiss_column = resolve_faiss_column(conn)
        repos = fetch_repos(conn, faiss_column)
        log.info(f"Found {len(repos)} repos without FAISS indexes")

        indexed = 0
        for i, repo in enumerate(repos):
            if ingest_repo(conn, repo, faiss_column, i + 1, len(repos)):
                indexed += 1
            time.sleep(0.3)

        log.info(f"\nDone - {indexed}/{len(repos)} repos indexed\n")

    finally:
        conn.close()

    log.info("=" * 55)
    log.info("Repo docs ingestion complete")
    log.info("=" * 55)


if __name__ == "__main__":
    main()
