# contribiq agent backend
#
# the agentic work (skill profiling, issue classification, match scoring)
# lives here in python/fastapi, separate from the next.js frontend.
# next.js calls this service via http when it needs AI work done.
#
# to run: uvicorn agent.main:app --reload --port 8000

import os
import json
import logging
from contextlib import asynccontextmanager

import httpx
import psycopg2
import redis
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from agent.skill_profiler import run_skill_profiler

# load env vars from the project root .env (shared with next.js)
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

logger = logging.getLogger("agent")
logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """startup / shutdown hooks — keeps things clean"""
    logger.info("agent backend starting up")
    yield
    logger.info("agent backend shutting down")


app = FastAPI(
    title="ContribIQ Agent",
    description="AI agentic backend for skill profiling, issue classification, and match scoring",
    version="0.1.0",
    lifespan=lifespan,
)

# allow the next.js frontend to talk to us
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -- health check --
@app.get("/health")
def health():
    return {"status": "ok", "service": "contribiq-agent"}


# -- request/response models --
class ProfileRequest(BaseModel):
    user_id: str
    github_token: str


# -- skill profiling endpoint (SSE) --
# next.js calls this instead of doing the AI work itself
# streams progress events back so the frontend can show a live progress bar
@app.post("/agent/profile")
async def profile_user(req: ProfileRequest):
    """
    runs the full skill profiling pipeline:
    1. fetch github data via octokit (well, httpx here)
    2. send to groq for analysis
    3. write skills to postgres
    4. embed into pgvector via gemini
    streams SSE events at each stage
    """

    async def event_stream():
        try:
            async for event in run_skill_profiler(req.user_id, req.github_token):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as e:
            logger.exception("profile pipeline failed")
            yield f"data: {json.dumps({'step': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
        },
    )
