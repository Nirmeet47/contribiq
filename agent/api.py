import logging

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from agent.contribution_summary import process_contribution, process_pending_contributions
from agent.match_scoring import score_matches
from agent.rag_service import stream_project_answer
from agent.skill_embedding import refresh_skill_embedding

app = FastAPI(title="ContribIQ AI API")
log = logging.getLogger("contribiq.ai_api")


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


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/projects/{repo_id}/ask")
def ask_repo(repo_id: str, payload: ProjectAskRequest) -> StreamingResponse:
    try:
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
