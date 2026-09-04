"""Local browser transport for Stewart's in-memory conversation runtime."""

from __future__ import annotations

import asyncio
import json
import logging
import os
from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass
from typing import Any
from uuid import uuid4

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from google.adk.events import Event
from pydantic import BaseModel, ConfigDict, Field

from stewart.contracts import (
    IMPACT_OUTPUT_KEY,
    LORE_OUTPUT_KEY,
    RELATIONSHIP_OUTPUT_KEY,
    TIMELINE_OUTPUT_KEY,
    ImpactResult,
    LoreFinding,
    LoreResult,
    RelationshipFinding,
    RelationshipResult,
    SpecialistStatus,
    StewartNextStep,
    TimelineFinding,
    TimelineResult,
    handle_specialist_result,
)
from stewart.display_text import normalize_display_text
from stewart.runtime import (
    SYNTHESIS_COMPLETE_RESPONSE,
    RunResult,
    RuntimeEventObserver,
    StewartConversation,
)

logger = logging.getLogger(__name__)

SAFE_RUNTIME_ERROR = (
    "Stewart could not complete this turn. Check the server configuration and try again."
)
COMPLETION_MESSAGE = SYNTHESIS_COMPLETE_RESPONSE

_AGENT_BY_TOOL = {
    "lore_agent": "lore",
    "timeline_agent": "timeline",
    "relationship_agent": "relationship",
    "impact_agent": "impact",
}
_AGENT_BY_AUTHOR = {tool_name: agent for tool_name, agent in _AGENT_BY_TOOL.items()}
_AGENT_BY_OUTPUT_KEY = {
    LORE_OUTPUT_KEY: "lore",
    TIMELINE_OUTPUT_KEY: "timeline",
    RELATIONSHIP_OUTPUT_KEY: "relationship",
    IMPACT_OUTPUT_KEY: "impact",
}
_ACTIVE_ACTIVITY = {
    "lore": "Reviewing lore and canon scope",
    "timeline": "Reviewing chronology and dependencies",
    "relationship": "Reviewing character and organization relationships",
    "impact": "Analyzing combined specialist findings",
}

BrowserEvent = dict[str, Any]
ConversationFactory = Callable[..., Awaitable[StewartConversation]]


class WriterMessageRequest(BaseModel):
    """One writer message submitted from the local browser."""

    model_config = ConfigDict(extra="forbid")

    message: str = Field(min_length=1, max_length=20_000)


@dataclass
class _BrowserSession:
    conversation: StewartConversation
    lock: asyncio.Lock


class BrowserConversationRegistry:
    """Own temporary Stewart conversations for local browser sessions."""

    def __init__(self, factory: ConversationFactory = StewartConversation.create) -> None:
        self._factory = factory
        self._sessions: dict[str, _BrowserSession] = {}

    async def create(self) -> str:
        conversation_id = str(uuid4())
        conversation = await self._factory(
            user_id=f"browser-writer-{conversation_id}",
            session_id=conversation_id,
        )
        self._sessions[conversation_id] = _BrowserSession(
            conversation=conversation,
            lock=asyncio.Lock(),
        )
        return conversation_id

    def get(self, conversation_id: str) -> _BrowserSession | None:
        return self._sessions.get(conversation_id)

    async def send(
        self,
        conversation_id: str,
        message: str,
        *,
        on_event: RuntimeEventObserver,
    ) -> RunResult:
        session = self.get(conversation_id)
        if session is None:
            raise KeyError(conversation_id)
        async with session.lock:
            return await session.conversation.send(message, on_event=on_event)


class BrowserEventMapper:
    """Translate observed ADK/runtime evidence into the Writer's Room contract."""

    def __init__(self) -> None:
        self._investigation_started = False

    def from_runtime_event(self, event: Event) -> list[BrowserEvent]:
        events: list[BrowserEvent] = []
        function_calls = []
        if event.content:
            function_calls = [
                part.function_call
                for part in event.content.parts or []
                if part.function_call and part.function_call.name
            ]

        for function_call in function_calls:
            tool_name = function_call.name
            agent = _AGENT_BY_TOOL.get(tool_name)
            if agent is not None:
                self._start_investigation(events)
                events.append(_status_event(agent, "active", _ACTIVE_ACTIVITY[agent]))
            elif tool_name == "parallel_search":
                author_agent = _AGENT_BY_AUTHOR.get(event.author)
                if author_agent is not None:
                    self._start_investigation(events)
                    events.append(
                        _status_event(author_agent, "active", "Searching sources with Parallel")
                    )

        for output_key, agent in _AGENT_BY_OUTPUT_KEY.items():
            validated_output = event.actions.state_delta.get(output_key)
            if validated_output is None:
                continue
            self._start_investigation(events)
            result = handle_specialist_result(output_key, validated_output).result
            if result.status is SpecialistStatus.NEEDS_INFORMATION:
                events.append(_status_event(agent, "needs_information", "Needs writer input"))
            elif isinstance(result, ImpactResult):
                events.append({"type": "impact_completed", "result": _impact_result(result)})
            else:
                events.append({"type": "specialist_completed", "result": _discovery_result(result)})
        return events

    def from_run_result(self, result: RunResult) -> list[BrowserEvent]:
        completed_synthesis = (
            result.next_step is StewartNextStep.SYNTHESIZE
            and result.impact_result is not None
            and result.stewardship_report is not None
        )
        events = [
            {
                "type": "stewart_message",
                "message": _conversation_message(
                    "stewart",
                    (
                        COMPLETION_MESSAGE
                        if completed_synthesis
                        else normalize_display_text(result.response)
                    ),
                    needs_writer_input=result.needs_writer_input,
                ),
            }
        ]
        if completed_synthesis:
            events.append({"type": "report_ready", "report": _report(result)})
        return events

    def _start_investigation(self, events: list[BrowserEvent]) -> None:
        if self._investigation_started:
            return
        self._investigation_started = True
        events.append({"type": "investigation_started"})


def _status_event(agent: str, status: str, activity: str) -> BrowserEvent:
    return {
        "type": "specialist_status",
        "agent": agent,
        "status": status,
        "activity": activity,
    }


def _conversation_message(
    speaker: str,
    text: str,
    *,
    needs_writer_input: bool = False,
) -> BrowserEvent:
    return {
        "id": str(uuid4()),
        "speaker": speaker,
        "text": text,
        "needsWriterInput": needs_writer_input,
    }


def _source_id(agent: str, index: int) -> str:
    return f"{agent}-source-{index + 1}"


def _finding_detail(finding: LoreFinding | TimelineFinding | RelationshipFinding) -> str:
    if isinstance(finding, LoreFinding):
        return finding.relevance
    if isinstance(finding, TimelineFinding):
        return finding.chronological_relevance
    return finding.relationship_relevance


def _discovery_result(result: LoreResult | TimelineResult | RelationshipResult) -> BrowserEvent:
    agent = (
        "lore"
        if isinstance(result, LoreResult)
        else "timeline"
        if isinstance(result, TimelineResult)
        else "relationship"
    )
    source_ids = {
        source.url: _source_id(agent, index) for index, source in enumerate(result.sources)
    }
    source_excerpts = {source.url: source.excerpts for source in result.sources}
    findings = []
    for index, finding in enumerate(result.findings):
        related_urls = list(dict.fromkeys(finding.source_urls))
        findings.append(
            {
                "id": f"{agent}-finding-{index + 1}",
                "title": normalize_display_text(finding.finding),
                "detail": normalize_display_text(_finding_detail(finding)),
                "evidence": [
                    normalize_display_text(excerpt)
                    for url in related_urls
                    for excerpt in source_excerpts.get(url, [])
                ],
                "sourceIds": [source_ids[url] for url in related_urls if url in source_ids],
            }
        )
    label = agent.capitalize()
    return {
        "agent": agent,
        "summary": (
            f"{label} returned {len(findings)} findings from {len(result.sources)} sources."
        ),
        "findings": findings,
        "sources": [
            {
                "id": _source_id(agent, index),
                "title": normalize_display_text(source.title),
                "url": source.url,
                "note": normalize_display_text("\n\n".join(source.excerpts)) or None,
            }
            for index, source in enumerate(result.sources)
        ],
        "assumptions": [
            normalize_display_text(assumption) for assumption in result.assumptions_and_uncertainty
        ],
    }


def _impact_result(result: ImpactResult) -> BrowserEvent:
    return {
        "summary": normalize_display_text(result.impact_summary or ""),
        "risks": [normalize_display_text(item) for item in result.risks],
        "opportunities": [normalize_display_text(item) for item in result.opportunities],
        "affectedAreas": [
            normalize_display_text(item) for item in result.affected_areas_and_entities
        ],
        "futureImplications": [normalize_display_text(item) for item in result.future_implications],
        "audienceConsiderations": [
            normalize_display_text(item) for item in result.audience_considerations
        ],
        "tradeoffs": [
            {
                "approach": normalize_display_text(tradeoff.approach),
                "benefits": [normalize_display_text(item) for item in tradeoff.benefits],
                "costs": [normalize_display_text(item) for item in tradeoff.costs],
            }
            for tradeoff in result.tradeoffs
        ],
        "assumptions": [
            normalize_display_text(assumption) for assumption in result.assumptions_and_uncertainty
        ],
    }


def _report(result: RunResult) -> BrowserEvent:
    report = result.stewardship_report
    if report is None:
        raise ValueError("A completed Stewardship Report is required for browser mapping")
    return {
        "assessment": normalize_display_text(report.assessment),
        "continuityConsiderations": [
            normalize_display_text(item) for item in report.continuity_considerations
        ],
        "opportunities": [normalize_display_text(item) for item in report.opportunities],
        "audienceConsiderations": [
            normalize_display_text(item) for item in report.audience_considerations
        ],
        "options": [
            {
                "title": normalize_display_text(option.title),
                "description": normalize_display_text(option.description),
                "benefits": [normalize_display_text(item) for item in option.benefits],
                "tradeoffs": [normalize_display_text(item) for item in option.tradeoffs],
            }
            for option in report.options
        ],
    }


def _ndjson(payload: BrowserEvent) -> str:
    return json.dumps(payload, separators=(",", ":")) + "\n"


def create_app(registry: BrowserConversationRegistry | None = None) -> FastAPI:
    """Create the local-only HTTP transport with injectable in-memory sessions."""
    app = FastAPI(title="Stewart Writer's Room transport")
    sessions = registry or BrowserConversationRegistry()

    @app.get("/api/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/api/conversations", status_code=201)
    async def create_conversation() -> JSONResponse:
        try:
            conversation_id = await sessions.create()
        except Exception as error:
            logger.error("Conversation creation failed: %s", type(error).__name__)
            return JSONResponse(status_code=503, content={"message": SAFE_RUNTIME_ERROR})
        return JSONResponse(status_code=201, content={"conversationId": conversation_id})

    @app.post("/api/conversations/{conversation_id}/messages")
    async def send_message(
        conversation_id: str,
        request: WriterMessageRequest,
    ) -> StreamingResponse:
        if sessions.get(conversation_id) is None:
            raise HTTPException(status_code=404, detail="Conversation not found")
        message = request.message.strip()
        if not message:
            raise HTTPException(status_code=422, detail="A non-empty writer message is required")

        async def stream() -> AsyncIterator[str]:
            mapper = BrowserEventMapper()
            queue: asyncio.Queue[BrowserEvent | None] = asyncio.Queue()

            await queue.put(
                {
                    "type": "writer_message",
                    "message": _conversation_message("writer", message),
                }
            )

            async def observe(event: Event) -> None:
                for browser_event in mapper.from_runtime_event(event):
                    await queue.put(browser_event)

            async def run_turn() -> None:
                try:
                    result = await sessions.send(
                        conversation_id,
                        message,
                        on_event=observe,
                    )
                    for browser_event in mapper.from_run_result(result):
                        await queue.put(browser_event)
                except Exception as error:
                    logger.error("Writer turn failed: %s", type(error).__name__)
                    await queue.put({"error": {"message": SAFE_RUNTIME_ERROR}})
                finally:
                    await queue.put(None)

            task = asyncio.create_task(run_turn())
            try:
                while True:
                    browser_event = await queue.get()
                    if browser_event is None:
                        break
                    yield _ndjson(browser_event)
                await task
            finally:
                if not task.done():
                    task.cancel()

        return StreamingResponse(stream(), media_type="application/x-ndjson")

    return app


app = create_app()


def main() -> None:
    """Run the local browser transport on the Vite proxy target."""
    port = int(os.getenv("STEWART_WEB_PORT", "8000"))
    uvicorn.run("stewart.web:app", host="127.0.0.1", port=port)
