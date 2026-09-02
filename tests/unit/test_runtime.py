import asyncio
from collections.abc import AsyncIterator
from unittest.mock import AsyncMock

import pytest
from google.adk.events import Event, EventActions
from google.genai import types
from pydantic import ValidationError

from stewart.contracts import (
    IMPACT_OUTPUT_KEY,
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


def _impact_payload(
    status: str,
    question: str = "How central should this character become?",
) -> dict[str, object]:
    needs_information = status == "NEEDS_INFORMATION"
    return {
        "status": status,
        "sources": [],
        "assumptions_and_uncertainty": [],
        "additional_writer_context_required": needs_information,
        "clarification_question": question if needs_information else None,
        "impact_summary": None if needs_information else "The proposal creates a recurring arc.",
        "risks": ["An unresolved storyline may be crowded."],
        "opportunities": ["Two existing arcs can connect."],
        "affected_areas_and_entities": ["Nova Corps"],
        "future_implications": ["A sequel inherits this commitment."],
        "audience_considerations": ["The established rule needs a clear explanation."],
        "tradeoffs": [],
    }


def _specialist_event(author: str, output_key: str, payload: dict[str, object]) -> Event:
    return Event(
        author=author,
        actions=EventActions(state_delta={output_key: payload}),
        content=types.Content(role="model", parts=[types.Part(text=f"structured {author} output")]),
    )


def _tool_call_event(*tool_names: str) -> Event:
    return Event(
        author="stewart",
        content=types.Content(
            role="model",
            parts=[
                types.Part(
                    function_call=types.FunctionCall(
                        id=f"call-{index}",
                        name=tool_name,
                        args={"request": "investigate"},
                    )
                )
                for index, tool_name in enumerate(tool_names)
            ],
        ),
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


def test_runtime_retains_discovery_for_impact_across_same_session_clarification() -> None:
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
                _specialist_event("impact_agent", IMPACT_OUTPUT_KEY, _impact_payload("COMPLETE")),
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
    assert len(first.specialist_results) == 3
    assert second.response == "The combined investigation found these considerations."
    assert second.next_step is StewartNextStep.SYNTHESIZE
    assert second.needs_writer_input is False
    assert second.lore_result is not None
    assert second.timeline_result is not None
    assert second.relationship_result is not None
    assert second.impact_result is not None
    assert len(second.specialist_results) == 4
    assert conversation.session_id == "investigation-123"
    assert len(session_service.create_calls) == 1
    assert [call["session_id"] for call in runner.calls] == [
        "investigation-123",
        "investigation-123",
    ]


def test_impact_needs_information_continues_in_the_same_session() -> None:
    runner = _FakeRunner(
        [
            [
                _specialist_event("lore_agent", LORE_OUTPUT_KEY, _payload("COMPLETE")),
                _specialist_event(
                    "impact_agent",
                    IMPACT_OUTPUT_KEY,
                    _impact_payload("NEEDS_INFORMATION"),
                ),
                _stewart_event("How central should this character become?"),
            ],
            [
                _specialist_event("impact_agent", IMPACT_OUTPUT_KEY, _impact_payload("COMPLETE")),
                _stewart_event("Here are the risks, opportunities, and tradeoffs."),
            ],
        ]
    )
    session_service = _FakeSessionService()

    async def exercise() -> tuple[object, object]:
        conversation = await StewartConversation.create(
            session_id="impact-clarification",
            session_service=session_service,
            runner=runner,
        )
        first = await conversation.send("Introduce a new cosmic archivist.")
        second = await conversation.send("Make the character a recurring supporting role.")
        return first, second

    first, second = asyncio.run(exercise())

    assert first.next_step is StewartNextStep.ASK_WRITER
    assert first.impact_result is not None
    assert first.impact_result.clarification_question
    assert second.next_step is StewartNextStep.SYNTHESIZE
    assert second.impact_result is not None
    assert len(session_service.create_calls) == 1
    assert [call["session_id"] for call in runner.calls] == [
        "impact-clarification",
        "impact-clarification",
    ]


def test_completed_discovery_without_impact_exposes_the_impact_stage() -> None:
    runner = _FakeRunner(
        [
            [
                _specialist_event("lore_agent", LORE_OUTPUT_KEY, _payload("COMPLETE")),
                _stewart_event("Discovery is ready for impact analysis."),
            ]
        ]
    )

    async def exercise() -> object:
        conversation = await StewartConversation.create(
            session_service=_FakeSessionService(),
            runner=runner,
        )
        return await conversation.send("A proposal")

    result = asyncio.run(exercise())

    assert result.next_step is StewartNextStep.ANALYZE_IMPACT
    assert result.impact_result is None


def test_new_discovery_invalidates_an_older_impact_result() -> None:
    runner = _FakeRunner(
        [
            [
                _specialist_event("lore_agent", LORE_OUTPUT_KEY, _payload("COMPLETE")),
                _specialist_event("impact_agent", IMPACT_OUTPUT_KEY, _impact_payload("COMPLETE")),
                _stewart_event("Initial guidance."),
            ],
            [
                _specialist_event("timeline_agent", TIMELINE_OUTPUT_KEY, _payload("COMPLETE")),
                _stewart_event("Updated discovery is ready for Impact."),
            ],
        ]
    )

    async def exercise() -> object:
        conversation = await StewartConversation.create(
            session_service=_FakeSessionService(),
            runner=runner,
        )
        await conversation.send("Initial proposal")
        return await conversation.send("Additional timeline context")

    result = asyncio.run(exercise())

    assert result.next_step is StewartNextStep.ANALYZE_IMPACT
    assert result.impact_result is None


def test_runtime_trace_orders_impact_after_concurrent_discovery_calls() -> None:
    runner = _FakeRunner(
        [
            [
                _tool_call_event("lore_agent", "timeline_agent", "relationship_agent"),
                _specialist_event("lore_agent", LORE_OUTPUT_KEY, _payload("COMPLETE")),
                _specialist_event("timeline_agent", TIMELINE_OUTPUT_KEY, _payload("COMPLETE")),
                _specialist_event(
                    "relationship_agent", RELATIONSHIP_OUTPUT_KEY, _payload("COMPLETE")
                ),
                _tool_call_event("impact_agent"),
                _specialist_event("impact_agent", IMPACT_OUTPUT_KEY, _impact_payload("COMPLETE")),
                _stewart_event("Final stewardship guidance."),
            ]
        ]
    )

    async def exercise() -> object:
        conversation = await StewartConversation.create(
            session_service=_FakeSessionService(),
            runner=runner,
        )
        return await conversation.send("A proposal requiring all specialists")

    result = asyncio.run(exercise())

    assert result.tool_calls[:3] == ("lore_agent", "timeline_agent", "relationship_agent")
    assert result.tool_calls[3] == "impact_agent"
    assert result.impact_result is not None
    assert len(result.specialist_results) == 4


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
    invalid_payload = _impact_payload("NEEDS_INFORMATION")
    invalid_payload["clarification_question"] = None
    runner = _FakeRunner([[_specialist_event("impact_agent", IMPACT_OUTPUT_KEY, invalid_payload)]])

    async def exercise() -> None:
        conversation = await StewartConversation.create(
            session_service=_FakeSessionService(),
            runner=runner,
        )
        await conversation.send("An underspecified proposal")

    with pytest.raises(ValidationError, match="clarification_question"):
        asyncio.run(exercise())


def test_runtime_forwards_observed_events_to_browser_transport() -> None:
    events = [
        _tool_call_event("lore_agent"),
        _specialist_event("lore_agent", LORE_OUTPUT_KEY, _payload("COMPLETE")),
        _stewart_event("Final guidance."),
    ]
    runner = _FakeRunner([events])
    observer = AsyncMock()

    async def exercise() -> object:
        conversation = await StewartConversation.create(
            session_service=_FakeSessionService(),
            runner=runner,
        )
        return await conversation.send("A proposal", on_event=observer)

    asyncio.run(exercise())

    assert [call.args[0] for call in observer.await_args_list] == events


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
