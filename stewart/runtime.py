"""In-memory local runtime for the first Stewart vertical slice."""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any, Protocol
from uuid import uuid4

from google.adk.events import Event
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from stewart.agent import root_agent
from stewart.contracts import (
    LORE_OUTPUT_KEY,
    LoreBranchDecision,
    LoreResult,
    StewartNextStep,
    handle_lore_result,
)

APP_NAME = "stewart"


@dataclass(frozen=True)
class RunResult:
    """One Stewart turn plus contract and trace evidence."""

    response: str
    agent_authors: tuple[str, ...]
    tool_calls: tuple[str, ...]
    next_step: StewartNextStep | None
    lore_result: LoreResult | None

    @property
    def needs_writer_input(self) -> bool:
        """Whether Stewart is waiting for clarification from the writer."""
        return self.next_step is StewartNextStep.ASK_WRITER


class _Runner(Protocol):
    def run_async(
        self,
        *,
        user_id: str,
        session_id: str,
        new_message: types.Content,
    ) -> AsyncIterator[Event]: ...


class StewartConversation:
    """A temporary multi-turn Stewart investigation backed by one ADK session."""

    def __init__(
        self,
        *,
        runner: _Runner,
        session_service: Any,
        user_id: str,
        session_id: str,
    ) -> None:
        self._runner = runner
        self._session_service = session_service
        self.user_id = user_id
        self.session_id = session_id

    @classmethod
    async def create(
        cls,
        *,
        user_id: str = "local-writer",
        session_id: str | None = None,
        session_service: Any | None = None,
        runner: _Runner | None = None,
    ) -> StewartConversation:
        """Create one in-memory session that can process multiple writer turns."""
        resolved_session_id = session_id or str(uuid4())
        resolved_service = session_service or InMemorySessionService()
        await resolved_service.create_session(
            app_name=APP_NAME,
            user_id=user_id,
            session_id=resolved_session_id,
        )
        resolved_runner = runner or Runner(
            agent=root_agent,
            app_name=APP_NAME,
            session_service=resolved_service,
        )
        return cls(
            runner=resolved_runner,
            session_service=resolved_service,
            user_id=user_id,
            session_id=resolved_session_id,
        )

    async def send(self, writer_message: str) -> RunResult:
        """Run one writer turn in this conversation's existing ADK session."""
        if not writer_message.strip():
            raise ValueError("A non-empty writer message is required")

        message = types.Content(role="user", parts=[types.Part(text=writer_message)])
        final_response: str | None = None
        authors: list[str] = []
        tool_calls: list[str] = []
        lore_decision: LoreBranchDecision | None = None

        async for event in self._runner.run_async(
            user_id=self.user_id,
            session_id=self.session_id,
            new_message=message,
        ):
            if event.author and event.author not in authors:
                authors.append(event.author)
            if event.content:
                for part in event.content.parts or []:
                    if part.function_call and part.function_call.name:
                        tool_calls.append(part.function_call.name)

            validated_lore_output = event.actions.state_delta.get(LORE_OUTPUT_KEY)
            if validated_lore_output is not None:
                lore_decision = handle_lore_result(validated_lore_output)

            if event.author == root_agent.name and event.is_final_response():
                event_text = _text_from_event(event)
                if event_text:
                    final_response = event_text

        if final_response is None and lore_decision and lore_decision.writer_response_override:
            final_response = lore_decision.writer_response_override
        if final_response is None:
            raise RuntimeError("Stewart completed without a final writer response")

        return RunResult(
            response=final_response,
            agent_authors=tuple(authors),
            tool_calls=tuple(tool_calls),
            next_step=lore_decision.next_step if lore_decision else None,
            lore_result=lore_decision.result if lore_decision else None,
        )


def _text_from_event(event: Event) -> str | None:
    if not event.content or not event.content.parts:
        return None
    text_parts = [part.text for part in event.content.parts if part.text and not part.thought]
    return "\n".join(text_parts) if text_parts else None


async def run_proposal(proposal: str) -> RunResult:
    """Convenience entry point for one proposal turn in a new memory-only session."""
    conversation = await StewartConversation.create()
    return await conversation.send(proposal)
