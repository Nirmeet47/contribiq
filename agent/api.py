from fastapi import FastAPI, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

from agent.match_scoring import score_matches
from agent.rag_service import ask_project

app = FastAPI(title="ContribIQ AI API")


class ChatMessage(BaseModel):
    role: str
    content: str


class ProjectAskRequest(BaseModel):
    query: str = Field(min_length=1)
    messages: list[ChatMessage] = []


class MatchScoreRequest(BaseModel):
    userId: str | None = None
    issueId: str | None = None


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/projects/{repo_id}/ask", response_class=PlainTextResponse)
def ask_repo(repo_id: str, payload: ProjectAskRequest) -> str:
    try:
        history = [message.model_dump() for message in payload.messages]
        return ask_project(repo_id, payload.query, history)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/matches/score")
def score_matches_endpoint(payload: MatchScoreRequest) -> dict:
    try:
        return score_matches(issue_id=payload.issueId, user_id=payload.userId)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
