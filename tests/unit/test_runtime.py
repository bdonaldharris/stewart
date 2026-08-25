import asyncio
from collections.abc import AsyncIterator
from unittest.mock import AsyncMock

import pytest
from google.adk.events import Event, EventActions
from google.genai import types
from pydantic import ValidationError

from stewart.contracts import (
    LORE_OUTPUT_KEY,
    RELATIONSHIP_OUTPUT_KEY,
    TIMELINE_OUTPUT_KEY,
    StewartNextStep,
)
from stewart.runtime import StewartConversation, run_proposal


def _payload(
    status: str, question: str = "What additional context should I use?"
) -> dict[str, object]:
    needs_information = status == "NEEDS_INFORMATION"
    return {
        "status": status,
        "findings": [],
        "sources": [],
        "assumptions_and_uncertainty": [],
        "additional_writer_context_required": needs_information,
        "clarification_question": question if needs_information else None,
    }


def _specialist_event(author: str, output_key: str, payload: dict[str, object]) -> Event:
    return Event(
        author=author,
        actions=EventActions(state_delta={output_key: payload}),
        content=types.Content(role="model", parts=[types.Part(text=f"structured {author} output")]),
    )


def _stewart_event(text: str) -> Event:
    return Event(
        author="stewart",
        content=types.Content(role="model", parts=[types.Part(text=text)]),
    )


class _FakeSessionService:
    def __init__(self) -> None:
        self.create_calls: list[dict[str, str]] = []

    async def create_session(self, **kwargs: str) -> None:
        self.create_calls.append(kwargs)


class _FakeRunner:
    def __init__(self, turns: list[list[Event]]) -> None:
        self._turns = iter(turns)
        self.calls: list[dict[str, object]] = []

    async def run_async(self, **kwargs: object) -> AsyncIterator[Event]:
        self.calls.append(kwargs)
        for event in next(self._turns):
            yield event


def test_runtime_retains_multiple_results_across_same_session_clarification() -> None:
    runner = _FakeRunner(
        [
            [
                _specialist_event("lore_agent", LORE_OUTPUT_KEY, _payload("COMPLETE")),
                _specialist_event(
                    "timeline_agent",
                    TIMELINE_OUTPUT_KEY,
                    _payload("NEEDS_INFORMATION", "When in the MCU does this take place?"),
                ),
                _specialist_event(
                    "relationship_agent", RELATIONSHIP_OUTPUT_KEY, _payload("COMPLETE")
                ),
                _stewart_event("Could you clarify when this story takes place in the MCU?"),
            ],
            [
                _specialist_event("timeline_agent", TIMELINE_OUTPUT_KEY, _payload("COMPLETE")),
                _stewart_event("The combined investigation found these considerations."),
            ],
        ]
    )
    session_service = _FakeSessionService()

    async def exercise() -> tuple[object, object, StewartConversation]:
        conversation = await StewartConversation.create(
            session_id="investigation-123",
            session_service=session_service,
            runner=runner,
        )
        first = await conversation.send("A cosmic character appears after a major event.")
        second = await conversation.send("It takes place immediately after Endgame.")
        return first, second, conversation

    first, second, conversation = asyncio.run(exercise())

    assert first.response == "Could you clarify when this story takes place in the MCU?"
    assert first.next_step is StewartNextStep.ASK_WRITER
    assert first.needs_writer_input is True
    assert first.lore_result is not None
    assert first.timeline_result is not None
    assert first.relationship_result is not None
    assert len(first.specialist_results) == 3
    assert second.response == "The combined investigation found these considerations."
    assert second.next_step is StewartNextStep.SYNTHESIZE
    assert second.needs_writer_input is False
    assert len(second.specialist_results) == 3
    assert conversation.session_id == "investigation-123"
    assert len(session_service.create_calls) == 1
    assert [call["session_id"] for call in runner.calls] == [
        "investigation-123",
        "investigation-123",
    ]
    second_message = runner.calls[1]["new_message"]
    assert isinstance(second_message, types.Content)
    assert second_message.parts[0].text == "It takes place immediately after Endgame."


def test_runtime_uses_specialist_questions_only_when_stewart_produces_no_text() -> None:
    runner = _FakeRunner(
        [
            [
                _specialist_event(
                    "timeline_agent",
                    TIMELINE_OUTPUT_KEY,
                    _payload("NEEDS_INFORMATION", "When does this happen?"),
                ),
                _specialist_event(
                    "relationship_agent",
                    RELATIONSHIP_OUTPUT_KEY,
                    _payload("NEEDS_INFORMATION", "Who already knows the character?"),
                ),
            ]
        ]
    )

    async def exercise() -> object:
        conversation = await StewartConversation.create(
            session_service=_FakeSessionService(),
            runner=runner,
        )
        return await conversation.send("An underspecified proposal")

    result = asyncio.run(exercise())

    assert result.response == (
        "I need a little more context:\n"
        "- Timeline: When does this happen?\n"
        "- Relationship: Who already knows the character?"
    )
    assert result.next_step is StewartNextStep.ASK_WRITER


def test_runtime_rejects_invalid_validated_specialist_state() -> None:
    invalid_payload = _payload("NEEDS_INFORMATION")
    invalid_payload["clarification_question"] = None
    runner = _FakeRunner(
        [[_specialist_event("timeline_agent", TIMELINE_OUTPUT_KEY, invalid_payload)]]
    )

    async def exercise() -> None:
        conversation = await StewartConversation.create(
            session_service=_FakeSessionService(),
            runner=runner,
        )
        await conversation.send("An underspecified proposal")

    with pytest.raises(ValidationError, match="clarification_question"):
        asyncio.run(exercise())


def test_run_proposal_uses_the_conversation_production_path(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    expected = AsyncMock()
    expected.send.return_value = "turn-result"
    create = AsyncMock(return_value=expected)
    monkeypatch.setattr(StewartConversation, "create", create)

    result = asyncio.run(run_proposal("A proposal"))

    assert result == "turn-result"
    create.assert_awaited_once_with()
    expected.send.assert_awaited_once_with("A proposal")
