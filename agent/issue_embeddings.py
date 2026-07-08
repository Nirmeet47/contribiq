import json
import logging
import os

from dotenv import load_dotenv
from google import genai

from agent.skill_canonical import canonicalize_skills, format_issue_embedding_text

load_dotenv()

log = logging.getLogger("issue_embeddings")

EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_DIMENSIONS = 768


def gemini_client() -> genai.Client:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is required")
    return genai.Client(api_key=api_key)


def canonical_required_skills(skills: list[str]) -> list[str]:
    return [skill.name for skill in canonicalize_skills(skills)]


def embed_required_skills(client: genai.Client, required_skills: list[str]) -> list[float] | None:
    if not required_skills:
        return None
    text = format_issue_embedding_text(required_skills)
    try:
        response = client.models.embed_content(
            model=EMBEDDING_MODEL,
            contents=text,
            config={"output_dimensionality": EMBEDDING_DIMENSIONS},
        )
        return response.embeddings[0].values
    except Exception as exc:
        log.warning("issue skill embedding failed: %s", exc)
        return None


def vector_literal(values: list[float]) -> str:
    return json.dumps(values)
