import json
import logging
import os
from pathlib import Path
from typing import Any

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from google import genai
from groq import Groq

try:
    from langchain_core.messages import HumanMessage, SystemMessage
    from langchain_groq import ChatGroq
except Exception:
    ChatGroq = None
    HumanMessage = None
    SystemMessage = None

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

log = logging.getLogger("rag_service")

EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_DIMENSIONS = 768
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")


def database_url() -> str:
    value = os.getenv("DATABASE_URL")
    if not value:
        raise RuntimeError("DATABASE_URL is required")
    return value


def vector_literal(values: list[float]) -> str:
    return json.dumps(values)


def embed_query(query: str) -> list[float]:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is required")
    client = genai.Client(api_key=api_key)
    response = client.models.embed_content(
        model=EMBEDDING_MODEL,
        contents=query,
        config={"output_dimensionality": EMBEDDING_DIMENSIONS},
    )
    return response.embeddings[0].values


def get_repo(repo_id: str) -> dict[str, Any] | None:
    with psycopg2.connect(database_url()) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute('SELECT id, owner, name FROM repos WHERE id = %s', (repo_id,))
            return cur.fetchone()


def search_docs(repo_id: str, query: str, limit: int = 4) -> list[str]:
    query_vector = vector_literal(embed_query(query))
    with psycopg2.connect(database_url()) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT "chunkText"
                FROM repo_docs
                WHERE "repoId" = %s
                ORDER BY embedding <=> %s::vector
                LIMIT %s
                """,
                (repo_id, query_vector, limit),
            )
            return [row["chunkText"] for row in cur.fetchall()]


def get_open_issues(repo_id: str) -> list[dict[str, Any]]:
    with psycopg2.connect(database_url()) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT title, difficulty, "issueType", "aiSummary"
                FROM issues
                WHERE "repoId" = %s
                  AND state = 'open'
                  AND classified = true
                ORDER BY "updatedAt" DESC
                LIMIT 10
                """,
                (repo_id,),
            )
            return [dict(row) for row in cur.fetchall()]


def get_repo_stats(repo_id: str) -> dict[str, Any] | None:
    with psycopg2.connect(database_url()) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                'SELECT "activityScore", "maintainerScore" FROM repos WHERE id = %s',
                (repo_id,),
            )
            repo = cur.fetchone()
            if not repo:
                return None
            cur.execute(
                """
                SELECT "issueType", COUNT(*)::int AS count
                FROM issues
                WHERE "repoId" = %s
                  AND state = 'open'
                  AND classified = true
                  AND "issueType" IS NOT NULL
                GROUP BY "issueType"
                """,
                (repo_id,),
            )
            breakdown = {row["issueType"]: row["count"] for row in cur.fetchall()}
    return {
        "activityScore": float(repo["activityScore"]),
        "maintainerScore": float(repo["maintainerScore"]),
        "issueTypeBreakdown": breakdown,
    }


def build_context(repo: dict[str, Any], query: str) -> dict[str, Any]:
    docs = search_docs(repo["id"], query)
    issues = get_open_issues(repo["id"])
    stats = get_repo_stats(repo["id"])
    return {"repo": repo, "docs": docs, "issues": issues, "stats": stats}


def build_prompt(query: str, history: list[dict[str, str]], context: dict[str, Any]) -> str:
    docs_text = (
        "\n\n---\n\n".join(f"Chunk {index + 1}:\n{chunk}" for index, chunk in enumerate(context["docs"]))
        or "No README.md or CONTRIBUTING.md chunks are indexed for this repo yet."
    )
    issues_text = json.dumps(context["issues"], ensure_ascii=False)
    stats_text = json.dumps(context["stats"], ensure_ascii=False)
    history_text = "\n".join(f"{item['role']}: {item['content']}" for item in history[-6:])
    repo = context["repo"]
    return f"""Repo: {repo['owner']}/{repo['name']}

Conversation history:
{history_text or 'none'}

Retrieved docs:
{docs_text}

Open issues:
{issues_text}

Repo stats:
{stats_text}

Question:
{query}
"""


def answer_with_langchain(prompt: str) -> str | None:
    if ChatGroq is None or HumanMessage is None or SystemMessage is None:
        return None
    model = ChatGroq(model=GROQ_MODEL, temperature=0.1, max_tokens=500)
    response = model.invoke(
        [
            SystemMessage(
                content=(
                    "You help contributors understand this repo. Answer only from the provided "
                    "docs, open issues, and repo stats. If the context is not relevant, say so."
                )
            ),
            HumanMessage(content=prompt),
        ]
    )
    return str(response.content)


def answer_with_groq(prompt: str) -> str:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("GROQ_API_KEY is required")
    client = Groq(api_key=api_key)
    completion = client.chat.completions.create(
        model=GROQ_MODEL,
        temperature=0.1,
        max_tokens=500,
        messages=[
            {
                "role": "system",
                "content": (
                    "You help contributors understand this repo. Answer only from the provided "
                    "docs, open issues, and repo stats. If the context is not relevant, say so."
                ),
            },
            {"role": "user", "content": prompt},
        ],
    )
    return completion.choices[0].message.content or ""


def ask_project(repo_id: str, query: str, history: list[dict[str, str]] | None = None) -> str:
    repo = get_repo(repo_id)
    if not repo:
        raise ValueError("Repo not found")
    context = build_context(repo, query)
    prompt = build_prompt(query, history or [], context)
    return answer_with_langchain(prompt) or answer_with_groq(prompt)
