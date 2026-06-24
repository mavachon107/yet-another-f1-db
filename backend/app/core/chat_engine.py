"""Streaming chat orchestrator using Claude API with tool_use."""

from __future__ import annotations

import json
import os
from typing import AsyncGenerator

import anthropic
from sqlmodel import Session

from app.core.chat_tools import TOOLS, execute_tool

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
CHAT_MODEL = os.getenv("CHAT_MODEL", "claude-sonnet-4-20250514")
CHAT_MAX_TOKENS = int(os.getenv("CHAT_MAX_TOKENS", "2048"))
MAX_TOOL_ROUNDS = 5

SYSTEM_PROMPT = """\
You are the Straight Line F1 assistant, an expert on Formula 1 history and statistics.
You have access to a comprehensive F1 database spanning from 1950 to the present.

Rules:
- ALWAYS use your tools to look up data. Never guess statistics or results.
- If you need to identify a driver, circuit, or constructor first, search for them to get their ID, then use that ID in follow-up tools.
- For comparisons, fetch stats for both entities before answering.
- Keep answers concise but informative. Use bullet points or tables for lists.
- If data is not in the database, say so honestly.
- When listing seasons or standings, use the list_seasons tool first to find the correct season_id for a given year.
- When mentioning entities, link to their app page using markdown. Use these URL patterns with the entity's database ID:
  - Drivers: [Name](/ui/drivers/{id})
  - Constructors: [Name](/ui/constructors/{id})
  - Circuits: [Name](/ui/circuits/{id})
  - Teams: [Name](/ui/teams/{id})
  - Cars: [Name](/ui/cars/{id})
  - Engines: [Name](/ui/engines/{id})
  - Events: [Name](/ui/events/{id})
  - Seasons: [Year](/ui/seasons/{year})
  Only link an entity the first time you mention it in a response.
"""

# Convert tool defs to Claude API format
_CLAUDE_TOOLS = [
    {
        "name": t["name"],
        "description": t["description"],
        "input_schema": t["input_schema"],
    }
    for t in TOOLS
]


def _make_client(api_key: str | None = None) -> anthropic.AsyncAnthropic:
    key = api_key or ANTHROPIC_API_KEY
    if not key:
        raise RuntimeError(
            "No API key provided. Please add your Anthropic API key in the chat settings."
        )
    return anthropic.AsyncAnthropic(api_key=key)


async def stream_chat(
    messages: list[dict],
    db_session: Session,
    api_key: str | None = None,
) -> AsyncGenerator[str, None]:
    """Stream SSE events for a chat conversation.

    Yields lines in SSE format:
        data: {"type": "text", "content": "..."}
        data: {"type": "tool_status", "tool": "search_driver"}
        data: {"type": "done"}
    """
    try:
        client = _make_client(api_key)
    except RuntimeError as exc:
        yield _error_event(str(exc))
        return

    # Limit context to last 20 messages to control token usage
    api_messages = messages[-20:]

    for _round in range(MAX_TOOL_ROUNDS):
        try:
            response = await client.messages.create(
                model=CHAT_MODEL,
                max_tokens=CHAT_MAX_TOKENS,
                system=SYSTEM_PROMPT,
                messages=api_messages,
                tools=_CLAUDE_TOOLS,
            )
        except anthropic.AuthenticationError:
            yield _error_event(
                "Invalid API key. Please check your Anthropic API key in the chat settings."
            )
            return
        except anthropic.BadRequestError as exc:
            msg = _extract_api_message(exc)
            if "credit balance" in msg.lower() or "billing" in msg.lower():
                yield _error_event(
                    "Your Anthropic API credit balance is too low. "
                    "Please visit console.anthropic.com to add credits or upgrade your plan."
                )
            else:
                yield _error_event(f"Request error: {msg}")
            return
        except anthropic.RateLimitError:
            yield _error_event(
                "Anthropic API rate limit reached. Please wait a moment and try again."
            )
            return
        except anthropic.APIError as exc:
            yield _error_event(f"Anthropic API error: {_extract_api_message(exc)}")
            return

        # Stream text blocks to the client
        tool_use_blocks = []
        for block in response.content:
            if block.type == "text" and block.text:
                yield f"data: {json.dumps({'type': 'text', 'content': block.text})}\n\n"
            elif block.type == "tool_use":
                tool_use_blocks.append(block)

        # Check if the response was cut short by the token limit
        if response.stop_reason == "max_tokens":
            yield f"data: {json.dumps({'type': 'text', 'content': '\n\n_(Response was cut short due to length. Try asking a more specific question.)_'})}\n\n"
            break

        # If no tool calls, we're done
        if not tool_use_blocks:
            break

        # Execute each tool and feed results back
        tool_results = []
        for tool_block in tool_use_blocks:
            # Notify frontend about tool execution
            yield f"data: {json.dumps({'type': 'tool_status', 'tool': tool_block.name})}\n\n"

            result = execute_tool(tool_block.name, tool_block.input, db_session)
            tool_results.append(
                {
                    "type": "tool_result",
                    "tool_use_id": tool_block.id,
                    "content": json.dumps(result, default=str),
                }
            )

        # Add the assistant's response and tool results to the conversation
        api_messages.append({"role": "assistant", "content": response.content})
        api_messages.append({"role": "user", "content": tool_results})

    yield f"data: {json.dumps({'type': 'done'})}\n\n"


def _error_event(message: str) -> str:
    """Format an error as an SSE event."""
    return (
        f"data: {json.dumps({'type': 'error', 'content': message})}\n\n"
        f"data: {json.dumps({'type': 'done'})}\n\n"
    )


def _extract_api_message(exc: anthropic.APIError) -> str:
    """Pull a human-readable message from an Anthropic API exception."""
    body = getattr(exc, "body", None)
    if isinstance(body, dict):
        error = body.get("error", {})
        if isinstance(error, dict) and error.get("message"):
            return error["message"]
    return str(exc)
