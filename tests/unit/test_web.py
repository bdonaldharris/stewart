import asyncio
import json
from unittest.mock import AsyncMock

import pytest
from google.adk.events import Event, EventActions
from google.genai import types
from httpx import ASGITransport, AsyncClient

from stewart.contracts import (
    IMPACT_OUTPUT_KEY,
    LORE_OUTPUT_KEY,
    RELATIONSHIP_OUTPUT_KEY,
    TIMELINE_OUTPUT_KEY,
    ImpactResult,
    ImpactTradeoff,
    LoreFinding,
    LoreResult,
    RelationshipFinding,
    RelationshipResult,
    SpecialistStatus,
    StewardshipOption,
    StewardshipReport,
    StewartNextStep,
    TimelineFinding,
    TimelineResult,
)
from stewart.runtime import RunResult
from stewart.speech import (
    FIXED_LIFECYCLE_PHRASES,
    MAX_SPEECH_CHARACTERS,
    SpeechFailureKind,
    SpeechProviderError,
    StewartSpeechSynthesizer,
)
from stewart.web import (
    COMPLETION_MESSAGE,
    SAFE_RUNTIME_ERROR,
    BrowserConversationRegistry,
    BrowserEventMapper,
    create_app,
)

SOURCE_URL = "https://example.com/prot%C3%A9g%C3%A9?confidence=50%25"


def _source() -> dict[str, object]:
    return {
        "title": "**Marvel continuity reference**",
        "url": SOURCE_URL,
        "excerpts": ["The prot%C3%A9g%C3%A9 has a 50% chance of protecting Xandar."],
    }


def _lore_result(status: SpecialistStatus = SpecialistStatus.COMPLETE) -> LoreResult:
    needs_information = status is SpecialistStatus.NEEDS_INFORMATION
    return LoreResult(
        status=status,
        findings=[]
        if needs_information
        else [
            LoreFinding(
                finding="The Nova Corps connection needs a defined point in canon.",
                relevance="The proposal depends on the status of Xandar and its defenders.",
                canon_scope="MCU_CANON",
                source_urls=[SOURCE_URL],
            )
        ],
        sources=[] if needs_information else [_source()],
        assumptions_and_uncertainty=["The exact year remains uncertain."],
        additional_writer_context_required=needs_information,
        clarification_question="When does the story take place?" if needs_information else None,
    )


def _impact_result() -> ImpactResult:
    return ImpactResult(
        status=SpecialistStatus.COMPLETE,
        sources=[],
        assumptions_and_uncertainty=[],
        additional_writer_context_required=False,
        clarification_question=None,
        impact_summary=(
            "### Impact summary\n"
            "**A prot%C3%A9g%C3%A9 creates a bounded recurring continuity commitment.** "
            "The role should remain focused.\n\n"
            "| Area | Effect |\n| --- | --- |\n| Team | Changes |"
        ),
        risks=["The *new mechanic* could resolve conflict too easily."],
        opportunities=["It can connect two cosmic storylines."],
        affected_areas_and_entities=["Nova Corps"],
        future_implications=["Later stories inherit the mechanic's limits."],
        audience_considerations=["The mechanic needs consistent rules."],
        tradeoffs=[
            ImpactTradeoff(
                approach="Use a supporting role",
                benefits=["Lower continuity load"],
                costs=["Less immediate narrative reach"],
            )
        ],
    )


def _stewardship_report() -> StewardshipReport:
    return StewardshipReport(
        assessment=(
            "The central decision is whether the recurring role earns the continuity "
            "commitment created by its new story rule."
        ),
        continuity_considerations=[
            "The canon placement and future rule constraints combine into one bounded commitment."
        ],
        opportunities=["Use the rule's limitation to generate character conflict."],
        audience_considerations=[
            "Explain the limitation on screen so the creative payoff preserves audience trust."
        ],
        options=[
            StewardshipOption(
                title="Test the premise in a supporting role",
                description=(
                    "Keep the first appearance bounded while proving the rule's story value."
                ),
                benefits=["Limits continuity load"],
                tradeoffs=["Delays broader franchise reach"],
            )
        ],
    )


def _timeline_result() -> TimelineResult:
    return TimelineResult(
        status=SpecialistStatus.COMPLETE,
        findings=[
            TimelineFinding(
                finding="The proposal follows Endgame.",
                chronological_relevance="The placement constrains character availability.",
                chronology_status="TEMPORAL_DEPENDENCY",
                source_urls=[SOURCE_URL],
            )
        ],
        sources=[_source()],
        assumptions_and_uncertainty=[],
        additional_writer_context_required=False,
        clarification_question=None,
    )


def _relationship_result() -> RelationshipResult:
    return RelationshipResult(
        status=SpecialistStatus.COMPLETE,
        findings=[
            RelationshipFinding(
                finding="The alliance affects the Guardians.",
                relationship_relevance="The existing team dynamic limits the introduction.",
                relationship_type="TEAM",
                source_urls=[SOURCE_URL],
            )
        ],
        sources=[_source()],
        assumptions_and_uncertainty=[],
        additional_writer_context_required=False,
        clarification_question=None,
    )


def _result(
    *,
    response: str,
    next_step: StewartNextStep,
    specialist_results: dict[str, object] | None = None,
    stewardship_report: StewardshipReport | None = None,
) -> RunResult:
    return RunResult(
        response=response,
        agent_authors=("stewart",),
        tool_calls=(),
        next_step=next_step,
        specialist_results=specialist_results or {},
        stewardship_report=stewardship_report,
    )


def _state_event(author: str, output_key: str, result: object) -> Event:
    return Event(
        author=author,
        actions=EventActions(state_delta={output_key: result}),
        content=types.Content(role="model", parts=[types.Part(text="structured output")]),
    )


def test_browser_registry_creates_one_conversation_and_continues_it() -> None:
    conversation = AsyncMock()
    conversation.send.side_effect = [
        _result(
            response="When does the story take place?",
            next_step=StewartNextStep.ASK_WRITER,
        ),
        _result(response="Final guidance", next_step=StewartNextStep.SYNTHESIZE),
    ]
    factory = AsyncMock(return_value=conversation)
    registry = BrowserConversationRegistry(factory=factory)
    observer = AsyncMock()

    async def exercise() -> str:
        conversation_id = await registry.create()
        await registry.send(conversation_id, "A proposal", on_event=observer)
        await registry.send(conversation_id, "Immediately after Endgame", on_event=observer)
        return conversation_id

    conversation_id = asyncio.run(exercise())

    factory.assert_awaited_once_with(
        user_id=f"browser-writer-{conversation_id}",
        session_id=conversation_id,
    )
    assert conversation.send.await_args_list[0].args == ("A proposal",)
    assert conversation.send.await_args_list[1].args == ("Immediately after Endgame",)
    assert conversation.send.await_args_list[0].kwargs == {"on_event": observer}


def _speech_synthesizer(audio: bytes = b"mp3-audio") -> AsyncMock:
    speech = AsyncMock(spec=StewartSpeechSynthesizer)
    speech.synthesize.return_value = audio
    return speech


def test_speech_endpoint_synthesizes_authorized_fixed_lifecycle_phrase_as_mp3() -> None:
    registry = BrowserConversationRegistry(factory=AsyncMock(return_value=AsyncMock()))
    speech = _speech_synthesizer()
    app = create_app(registry, speech=speech)
    phrase = "Lore investigation complete."
    assert phrase in FIXED_LIFECYCLE_PHRASES

    async def exercise():
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            conversation_id = (await client.post("/api/conversations")).json()["conversationId"]
            return await client.post(
                f"/api/conversations/{conversation_id}/speech",
                json={"text": phrase},
            )

    response = asyncio.run(exercise())

    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/mpeg"
    assert response.content == b"mp3-audio"
    speech.synthesize.assert_awaited_once_with(phrase)


def test_speech_endpoint_authorizes_only_emitted_stewart_text_for_conversation() -> None:
    conversation = AsyncMock()
    conversation.send.return_value = _result(
        response="**Who** is the falling out between?",
        next_step=StewartNextStep.ASK_WRITER,
    )
    registry = BrowserConversationRegistry(factory=AsyncMock(return_value=conversation))
    speech = _speech_synthesizer()
    app = create_app(registry, speech=speech)

    async def exercise():
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            conversation_id = (await client.post("/api/conversations")).json()["conversationId"]
            await client.post(
                f"/api/conversations/{conversation_id}/messages",
                json={"message": "A vague falling out"},
            )
            authorized = await client.post(
                f"/api/conversations/{conversation_id}/speech",
                json={"text": "Who is the falling out between?"},
            )
            writer = await client.post(
                f"/api/conversations/{conversation_id}/speech",
                json={"text": "A vague falling out"},
            )
            return authorized, writer

    authorized, writer = asyncio.run(exercise())

    assert authorized.status_code == 200
    assert writer.status_code == 403
    speech.synthesize.assert_awaited_once_with("Who is the falling out between?")


@pytest.mark.parametrize(
    "unauthorized_text",
    [
        "Arbitrary text supplied by the browser.",
        "A specialist finding must remain private.",
        "A report section must not become authorized speech.",
    ],
)
def test_speech_endpoint_rejects_arbitrary_specialist_and_report_text(
    unauthorized_text: str,
) -> None:
    registry = BrowserConversationRegistry(factory=AsyncMock(return_value=AsyncMock()))
    speech = _speech_synthesizer()
    app = create_app(registry, speech=speech)

    async def exercise():
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            conversation_id = (await client.post("/api/conversations")).json()["conversationId"]
            return await client.post(
                f"/api/conversations/{conversation_id}/speech",
                json={"text": unauthorized_text},
            )

    response = asyncio.run(exercise())

    assert response.status_code == 403
    speech.synthesize.assert_not_awaited()


def test_speech_endpoint_rejects_over_length_and_client_voice_configuration() -> None:
    registry = BrowserConversationRegistry(factory=AsyncMock(return_value=AsyncMock()))
    speech = _speech_synthesizer()
    app = create_app(registry, speech=speech)

    async def exercise():
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            conversation_id = (await client.post("/api/conversations")).json()["conversationId"]
            over_length = await client.post(
                f"/api/conversations/{conversation_id}/speech",
                json={"text": "x" * (MAX_SPEECH_CHARACTERS + 1)},
            )
            voice_override = await client.post(
                f"/api/conversations/{conversation_id}/speech",
                json={"text": "Lore investigation complete.", "voice": "another-voice"},
            )
            return over_length, voice_override

    over_length, voice_override = asyncio.run(exercise())

    assert over_length.status_code == 422
    assert voice_override.status_code == 422
    speech.synthesize.assert_not_awaited()


@pytest.mark.parametrize(
    ("kind", "status_code"),
    [
        (SpeechFailureKind.PERMISSION, 503),
        (SpeechFailureKind.QUOTA, 429),
        (SpeechFailureKind.TIMEOUT, 504),
        (SpeechFailureKind.UNAVAILABLE, 503),
    ],
)
def test_speech_endpoint_maps_expected_provider_failure_for_browser_fallback(
    kind: SpeechFailureKind,
    status_code: int,
) -> None:
    registry = BrowserConversationRegistry(factory=AsyncMock(return_value=AsyncMock()))
    speech = _speech_synthesizer()
    speech.synthesize.side_effect = SpeechProviderError(kind)
    app = create_app(registry, speech=speech)

    async def exercise():
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            conversation_id = (await client.post("/api/conversations")).json()["conversationId"]
            return await client.post(
                f"/api/conversations/{conversation_id}/speech",
                json={"text": "Impact investigation complete."},
            )

    response = asyncio.run(exercise())

    assert response.status_code == status_code
    assert response.json() == {"detail": "Stewart's hosted voice is temporarily unavailable."}


def test_mapper_preserves_parallel_evidence_and_finding_relationships() -> None:
    mapper = BrowserEventMapper()
    lore = _lore_result()

    mapped = mapper.from_runtime_event(_state_event("lore_agent", LORE_OUTPUT_KEY, lore))

    assert mapped[0] == {"type": "investigation_started"}
    result = mapped[1]["result"]
    assert mapped[1]["type"] == "specialist_completed"
    assert result["agent"] == "lore"
    assert result["sources"][0]["title"] == "Marvel continuity reference"
    assert result["sources"][0]["url"] == SOURCE_URL
    assert result["sources"][0]["note"] == "The protégé has a 50% chance of protecting Xandar."
    assert result["findings"][0]["evidence"] == [
        "The protégé has a 50% chance of protecting Xandar."
    ]
    assert result["findings"][0]["sourceIds"] == [result["sources"][0]["id"]]


def test_mapper_converts_each_completed_discovery_contract() -> None:
    cases = [
        ("lore_agent", LORE_OUTPUT_KEY, _lore_result(), "lore"),
        ("timeline_agent", TIMELINE_OUTPUT_KEY, _timeline_result(), "timeline"),
        (
            "relationship_agent",
            RELATIONSHIP_OUTPUT_KEY,
            _relationship_result(),
            "relationship",
        ),
    ]

    for author, output_key, contract, expected_agent in cases:
        mapped = BrowserEventMapper().from_runtime_event(_state_event(author, output_key, contract))

        assert mapped[-1]["type"] == "specialist_completed"
        assert mapped[-1]["result"]["agent"] == expected_agent
        assert mapped[-1]["result"]["findings"][0]["detail"]


def test_mapper_emits_real_activity_clarification_impact_and_report_events() -> None:
    mapper = BrowserEventMapper()
    tool_event = Event(
        author="stewart",
        content=types.Content(
            role="model",
            parts=[
                types.Part(
                    function_call=types.FunctionCall(
                        id="call-lore",
                        name="lore_agent",
                        args={"request": "Investigate canon"},
                    )
                )
            ],
        ),
    )
    activity = mapper.from_runtime_event(tool_event)
    clarification = mapper.from_runtime_event(
        _state_event(
            "lore_agent",
            LORE_OUTPUT_KEY,
            _lore_result(SpecialistStatus.NEEDS_INFORMATION),
        )
    )

    assert activity[0] == {"type": "investigation_started"}
    assert activity[1]["type"] == "specialist_status"
    assert activity[1]["agent"] == "lore"
    assert clarification == [
        {
            "type": "specialist_status",
            "agent": "lore",
            "status": "needs_information",
            "activity": "Needs writer input",
        }
    ]

    completed_mapper = BrowserEventMapper()
    lore = _lore_result()
    impact = _impact_result()
    impact_events = completed_mapper.from_runtime_event(
        _state_event("impact_agent", IMPACT_OUTPUT_KEY, impact)
    )
    run_events = completed_mapper.from_run_result(
        _result(
            response="Stewart's evidence-backed assessment.",
            next_step=StewartNextStep.SYNTHESIZE,
            specialist_results={LORE_OUTPUT_KEY: lore, IMPACT_OUTPUT_KEY: impact},
            stewardship_report=_stewardship_report(),
        )
    )

    assert impact_events[-1]["type"] == "impact_completed"
    assert impact_events[-1]["result"]["affectedAreas"] == ["Nova Corps"]
    assert "protégé" in impact_events[-1]["result"]["summary"]
    assert "###" not in impact_events[-1]["result"]["summary"]
    assert "**" not in impact_events[-1]["result"]["summary"]
    assert impact_events[-1]["result"]["risks"] == [
        "The new mechanic could resolve conflict too easily."
    ]
    assert impact_events[-1]["result"]["audienceConsiderations"] == [
        "The mechanic needs consistent rules."
    ]
    assert run_events[0]["type"] == "stewart_message"
    assert run_events[0]["message"]["text"] == COMPLETION_MESSAGE
    assert run_events[0]["message"]["needsWriterInput"] is False
    assert run_events[1]["type"] == "report_ready"
    assessment = run_events[1]["report"]["assessment"]
    assert assessment == _stewardship_report().assessment
    assert assessment != impact.impact_summary
    assert "Stewart's evidence-backed assessment." not in assessment
    assert all(marker not in assessment for marker in ("###", "**", "|"))
    assert run_events[1]["report"]["continuityConsiderations"] == [
        "The canon placement and future rule constraints combine into one bounded commitment."
    ]
    assert run_events[1]["report"]["opportunities"] != impact.opportunities
    assert run_events[1]["report"]["audienceConsiderations"] != impact.audience_considerations
    assert run_events[1]["report"]["options"][0]["title"] == (
        "Test the premise in a supporting role"
    )
    assert run_events[1]["report"]["options"][0]["description"]
    assert "affectedAreas" not in run_events[1]["report"]


def test_mapper_normalizes_meaningful_report_markdown_without_empty_bullets() -> None:
    report = _stewardship_report().model_copy(
        update={
            "opportunities": [],
            "audience_considerations": ["**Audience trust** requires clear setup."],
        }
    )

    events = BrowserEventMapper().from_run_result(
        _result(
            response="Synthesis complete.",
            next_step=StewartNextStep.SYNTHESIZE,
            specialist_results={IMPACT_OUTPUT_KEY: _impact_result()},
            stewardship_report=report,
        )
    )

    mapped_report = events[1]["report"]
    assert mapped_report["opportunities"] == []
    assert mapped_report["audienceConsiderations"] == ["Audience trust requires clear setup."]
    assert "-" not in mapped_report["audienceConsiderations"]


def test_mapper_normalizes_stewarts_actual_clarification_response_for_display() -> None:
    response = (
        "1. **Who** is the falling out between?\n"
        "2. **What** is the falling out about?\n"
        "3. **When** in the MCU timeline does it occur?"
    )
    expected = (
        "1. Who is the falling out between?\n"
        "2. What is the falling out about?\n"
        "3. When in the MCU timeline does it occur?"
    )

    events = BrowserEventMapper().from_run_result(
        _result(response=response, next_step=StewartNextStep.ASK_WRITER)
    )

    assert events == [
        {
            "type": "stewart_message",
            "message": {
                "id": events[0]["message"]["id"],
                "speaker": "stewart",
                "text": expected,
                "needsWriterInput": True,
            },
        }
    ]
    assert "**" not in events[0]["message"]["text"]


def test_transport_streams_safe_error_without_leaking_provider_details() -> None:
    conversation = AsyncMock()
    conversation.send.side_effect = RuntimeError("provider-secret-value credential payload")
    registry = BrowserConversationRegistry(factory=AsyncMock(return_value=conversation))
    app = create_app(registry)

    async def exercise():
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            create_response = await client.post("/api/conversations")
            conversation_id = create_response.json()["conversationId"]
            return await client.post(
                f"/api/conversations/{conversation_id}/messages",
                json={"message": "A proposal"},
            )

    response = asyncio.run(exercise())
    streamed = [json.loads(line) for line in response.text.splitlines()]

    assert response.status_code == 200
    assert streamed[0]["type"] == "writer_message"
    assert streamed[-1] == {"error": {"message": SAFE_RUNTIME_ERROR}}
    assert "secret-value" not in response.text


def test_transport_keeps_clarification_messages_in_one_browser_conversation() -> None:
    conversation = AsyncMock()
    conversation.send.side_effect = [
        _result(
            response="**When** does the story take place?",
            next_step=StewartNextStep.ASK_WRITER,
        ),
        _result(response="The investigation can continue.", next_step=StewartNextStep.SYNTHESIZE),
    ]
    factory = AsyncMock(return_value=conversation)
    app = create_app(BrowserConversationRegistry(factory=factory))

    async def exercise():
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            conversation_id = (await client.post("/api/conversations")).json()["conversationId"]
            first = await client.post(
                f"/api/conversations/{conversation_id}/messages",
                json={"message": "A cosmic character appears."},
            )
            second = await client.post(
                f"/api/conversations/{conversation_id}/messages",
                json={"message": "Immediately after Endgame."},
            )
            return first, second

    first, second = asyncio.run(exercise())
    first_events = [json.loads(line) for line in first.text.splitlines()]
    second_events = [json.loads(line) for line in second.text.splitlines()]

    factory.assert_awaited_once()
    assert conversation.send.await_count == 2
    assert first_events[-1]["message"]["needsWriterInput"] is True
    assert first_events[-1]["message"]["text"] == "When does the story take place?"
    assert "**" not in first_events[-1]["message"]["text"]
    assert second_events[-1]["message"]["needsWriterInput"] is False
    assert first_events[0]["message"]["text"] == "A cosmic character appears."
    assert second_events[0]["message"]["text"] == "Immediately after Endgame."


def test_transport_rejects_empty_writer_messages() -> None:
    registry = BrowserConversationRegistry(factory=AsyncMock(return_value=AsyncMock()))
    app = create_app(registry)

    async def exercise():
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            conversation_id = (await client.post("/api/conversations")).json()["conversationId"]
            return await client.post(
                f"/api/conversations/{conversation_id}/messages",
                json={"message": "   "},
            )

    response = asyncio.run(exercise())

    assert response.status_code == 422
    assert response.json()["detail"] == "A non-empty writer message is required"
