import logging
import os

import redis
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from agent.contribution_summary import process_contribution, process_pending_contributions
from agent.match_scoring import score_matches
from agent.rag_service import stream_project_answer
from agent.skill_embedding import refresh_skill_embedding

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

app = FastAPI(title="ContribIQ AI API")
log = logging.getLogger("contribiq.ai_api")

ASK_RATE_LIMIT = 5
ASK_RATE_LIMIT_WINDOW_SECONDS = 60
ASK_HOURLY_RATE_LIMIT = 30
ASK_HOURLY_RATE_LIMIT_WINDOW_SECONDS = 60 * 60
_redis_client: redis.Redis | None = None


class ChatMessage(BaseModel):
    role: str
    content: str


class ProjectAskRequest(BaseModel):
    question: str | None = Field(default=None, min_length=1)
    query: str | None = Field(default=None, min_length=1)
    history: list[ChatMessage] = []
    messages: list[ChatMessage] = []


class MatchScoreRequest(BaseModel):
    userId: str | None = None
    issueId: str | None = None


class SkillEmbeddingRefreshRequest(BaseModel):
    userId: str


class ContributionProcessRequest(BaseModel):
    contributionId: str | None = None


def get_redis_client() -> redis.Redis | None:
    global _redis_client

    if _redis_client is not None:
        return _redis_client

    redis_url = os.environ.get("REDIS_URL")
    if not redis_url:
        return None

    _redis_client = redis.Redis.from_url(redis_url, decode_responses=True)
    return _redis_client


def check_fixed_window_rate_limit(
    identity: str,
    name: str,
    limit: int,
    window_seconds: int,
) -> None:
    key = f"ratelimit:{name}:{identity}"

    try:
        client = get_redis_client()
        if client is None:
            return

        count = client.incr(key)
        if count == 1:
            client.expire(key, window_seconds)
        ttl = client.ttl(key)
        retry_after = ttl if ttl > 0 else window_seconds

        if count > limit:
            raise HTTPException(
                status_code=429,
                detail=f"Too many requests, try again in {retry_after} seconds",
                headers={"Retry-After": str(retry_after)},
            )
    except HTTPException:
        raise
    except Exception:
        log.exception("Redis rate-limit check failed; allowing project ask request")


def check_ask_rate_limit(identity: str) -> None:
    check_fixed_window_rate_limit(
        identity,
        "agent-ask",
        ASK_RATE_LIMIT,
        ASK_RATE_LIMIT_WINDOW_SECONDS,
    )
    check_fixed_window_rate_limit(
        identity,
        "agent-ask-hour",
        ASK_HOURLY_RATE_LIMIT,
        ASK_HOURLY_RATE_LIMIT_WINDOW_SECONDS,
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/projects/{repo_id}/ask")
def ask_repo(
    repo_id: str,
    payload: ProjectAskRequest,
    request: Request,
    x_contribiq_user_id: str | None = Header(default=None),
) -> StreamingResponse:
    try:
        identity = x_contribiq_user_id or f"ip:{request.client.host if request.client else 'unknown'}"
        check_ask_rate_limit(identity)

        question = payload.question or payload.query
        if not question:
            raise HTTPException(status_code=400, detail="Question is required")

        chat_history = payload.history or payload.messages
        history = [message.model_dump() for message in chat_history[-6:]]
        return StreamingResponse(
            stream_project_answer(repo_id, question, history),
            media_type="text/plain; charset=utf-8",
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("Project docs answer failed")
        raise HTTPException(status_code=502, detail="Project docs answer failed") from exc


@app.post("/matches/score")
def score_matches_endpoint(payload: MatchScoreRequest) -> dict:
    try:
        return score_matches(issue_id=payload.issueId, user_id=payload.userId)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/skills/refresh-embedding")
def refresh_skill_embedding_endpoint(payload: SkillEmbeddingRefreshRequest) -> dict:
    try:
        return refresh_skill_embedding(payload.userId)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/contributions/process")
def process_contribution_endpoint(payload: ContributionProcessRequest) -> dict:
    try:
        if payload.contributionId:
            return process_contribution(payload.contributionId)
        return process_pending_contributions()
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
