"""In-memory runtime for Stewart's concurrent specialist slice."""

from __future__ import annotations

from collections.abc import AsyncIterator, Awaitable, Callable, Mapping
from dataclasses import dataclass
from typing import Any, Protocol
from uuid import uuid4

from google.adk.events import Event
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from stewart.agent import root_agent
from stewart.contracts import (
    IMPACT_OUTPUT_KEY,
    LORE_OUTPUT_KEY,
    RELATIONSHIP_OUTPUT_KEY,
    TIMELINE_OUTPUT_KEY,
    ImpactResult,
    LoreResult,
    RelationshipResult,
    SpecialistResult,
    SpecialistStatus,
    StewartNextStep,
    TimelineResult,
    handle_specialist_result,
)

APP_NAME = "stewart"
SPECIALIST_OUTPUT_KEYS = (
    LORE_OUTPUT_KEY,
    TIMELINE_OUTPUT_KEY,
    RELATIONSHIP_OUTPUT_KEY,
    IMPACT_OUTPUT_KEY,
)

RuntimeEventObserver = Callable[[Event], Awaitable[None]]


@dataclass(frozen=True)
class RunResult:
    """One Stewart turn plus accumulated contract and trace evidence."""

    response: str
    agent_authors: tuple[str, ...]
    tool_calls: tuple[str, ...]
    next_step: StewartNextStep | None
    specialist_results: Mapping[str, SpecialistResult]

    @property
    def needs_writer_input(self) -> bool:
        """Whether Stewart is waiting for clarification from the writer."""
        return self.next_step is StewartNextStep.ASK_WRITER

    @property
    def lore_result(self) -> LoreResult | None:
        """Return the current Lore result, when Lore participated."""
        result = self.specialist_results.get(LORE_OUTPUT_KEY)
        return result if isinstance(result, LoreResult) else None

    @property
    def timeline_result(self) -> TimelineResult | None:
        """Return the current Timeline result, when Timeline participated."""
        result = self.specialist_results.get(TIMELINE_OUTPUT_KEY)
        return result if isinstance(result, TimelineResult) else None

    @property
    def relationship_result(self) -> RelationshipResult | None:
        """Return the current Relationship result, when Relationship participated."""
        result = self.specialist_results.get(RELATIONSHIP_OUTPUT_KEY)
        return result if isinstance(result, RelationshipResult) else None

    @property
    def impact_result(self) -> ImpactResult | None:
        """Return the current Impact result, when Impact participated."""
        result = self.specialist_results.get(IMPACT_OUTPUT_KEY)
        return result if isinstance(result, ImpactResult) else None


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
        self._specialist_results: dict[str, SpecialistResult] = {}
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

    async def send(
        self,
        writer_message: str,
        *,
        on_event: RuntimeEventObserver | None = None,
    ) -> RunResult:
        """Run one writer turn in this conversation's existing ADK session."""
        if not writer_message.strip():
            raise ValueError("A non-empty writer message is required")

        message = types.Content(role="user", parts=[types.Part(text=writer_message)])
        final_response: str | None = None
        authors: list[str] = []
        tool_calls: list[str] = []

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

            for output_key in SPECIALIST_OUTPUT_KEYS:
                validated_output = event.actions.state_delta.get(output_key)
                if validated_output is not None:
                    if output_key != IMPACT_OUTPUT_KEY:
                        self._specialist_results.pop(IMPACT_OUTPUT_KEY, None)
                    decision = handle_specialist_result(output_key, validated_output)
                    self._specialist_results[output_key] = decision.result

            if event.author == root_agent.name and event.is_final_response():
                event_text = _text_from_event(event)
                if event_text:
                    final_response = event_text

            if on_event is not None:
                await on_event(event)

        next_step = _next_step(self._specialist_results)
        if final_response is None and next_step is StewartNextStep.ASK_WRITER:
            final_response = _clarification_fallback(self._specialist_results)
        if final_response is None:
            raise RuntimeError("Stewart completed without a final writer response")

        return RunResult(
            response=final_response,
            agent_authors=tuple(authors),
            tool_calls=tuple(tool_calls),
            next_step=next_step,
            specialist_results=dict(self._specialist_results),
        )


def _next_step(results: Mapping[str, SpecialistResult]) -> StewartNextStep | None:
    if not results:
        return None
    if any(result.status is SpecialistStatus.NEEDS_INFORMATION for result in results.values()):
        return StewartNextStep.ASK_WRITER
    if IMPACT_OUTPUT_KEY not in results:
        return StewartNextStep.ANALYZE_IMPACT
    return StewartNextStep.SYNTHESIZE


def _clarification_fallback(results: Mapping[str, SpecialistResult]) -> str:
    labels = {
        LORE_OUTPUT_KEY: "Lore",
        TIMELINE_OUTPUT_KEY: "Timeline",
        RELATIONSHIP_OUTPUT_KEY: "Relationship",
        IMPACT_OUTPUT_KEY: "Impact",
    }
    questions = [
        (labels[output_key], result.clarification_question)
        for output_key, result in results.items()
        if result.status is SpecialistStatus.NEEDS_INFORMATION and result.clarification_question
    ]
    if len(questions) == 1:
        return questions[0][1]
    return "I need a little more context:\n" + "\n".join(
        f"- {label}: {question}" for label, question in questions
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
