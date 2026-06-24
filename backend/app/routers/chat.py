"""Chat endpoint for the AI assistant."""

from __future__ import annotations

import os
import time
from collections import defaultdict

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlmodel import Session, SQLModel

from app.core.chat_engine import stream_chat
from app.database import get_readonly_session

ENABLE_AI_CHAT = os.getenv("ENABLE_AI_CHAT", "false").lower() in ("true", "1", "yes")

public_router = APIRouter(prefix="/v1/chat", tags=["chat"])


class ChatMessage(SQLModel):
    role: str
    content: str


class ChatRequest(SQLModel):
    messages: list[ChatMessage]


# Simple in-memory rate limiter
_rate_buckets: dict[str, list[float]] = defaultdict(list)
_RATE_LIMIT = 10  # requests per minute
_RATE_WINDOW = 60  # seconds


def _check_rate_limit(client_ip: str) -> bool:
    now = time.time()
    bucket = _rate_buckets[client_ip]
    bucket[:] = [t for t in bucket if now - t < _RATE_WINDOW]
    if len(bucket) >= _RATE_LIMIT:
        return False
    bucket.append(now)
    return True


@public_router.get("/status")
async def chat_status():
    return {"enabled": ENABLE_AI_CHAT}


@public_router.post("")
async def chat(
    request_body: ChatRequest,
    request: Request,
    session: Session = Depends(get_readonly_session),
    x_anthropic_api_key: str | None = Header(default=None),
):
    if not ENABLE_AI_CHAT:
        raise HTTPException(status_code=404, detail="AI chat is not enabled.")

    client_ip = request.client.host if request.client else "unknown"
    if not _check_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Try again in a minute.")

    messages = [{"role": m.role, "content": m.content} for m in request_body.messages]

    return StreamingResponse(
        stream_chat(messages, session, api_key=x_anthropic_api_key),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
