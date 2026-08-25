import asyncio
from typing import Any, cast

from google.adk.agents.invocation_context import InvocationContext
from google.adk.flows.llm_flows.functions import handle_function_call_list_async
from google.adk.sessions import InMemorySessionService
from google.genai import types

from stewart.agent import STEWART_INSTRUCTION, root_agent
from stewart.contracts import (
    IMPACT_OUTPUT_KEY,
    LORE_OUTPUT_KEY,
    RELATIONSHIP_OUTPUT_KEY,
    TIMELINE_OUTPUT_KEY,
)
from stewart.impact_agent import build_impact_instruction, impact_agent
from stewart.lore_agent import lore_agent
from stewart.relationship_agent import relationship_agent
from stewart.timeline_agent import timeline_agent

DISCOVERY_AGENTS = [lore_agent, timeline_agent, relationship_agent]


def test_stewart_owns_four_separate_single_turn_specialists() -> None:
    specialists = [*DISCOVERY_AGENTS, impact_agent]

    assert root_agent.name == "stewart"
    assert root_agent.sub_agents == specialists
    assert all(specialist is not root_agent for specialist in specialists)
    assert [specialist.name for specialist in specialists] == [
        "lore_agent",
        "timeline_agent",
        "relationship_agent",
        "impact_agent",
    ]
    assert all(specialist.mode == "single_turn" for specialist in specialists)
    assert [specialist.output_key for specialist in specialists] == [
        LORE_OUTPUT_KEY,
        TIMELINE_OUTPUT_KEY,
        RELATIONSHIP_OUTPUT_KEY,
        IMPACT_OUTPUT_KEY,
    ]


def test_parallel_search_is_limited_to_discovery_specialists() -> None:
    for specialist in DISCOVERY_AGENTS:
        assert [tool.__name__ for tool in specialist.tools] == ["parallel_search"]

    assert impact_agent.tools == []
    assert [tool.name for tool in root_agent.tools] == [
        "lore_agent",
        "timeline_agent",
        "relationship_agent",
        "impact_agent",
    ]
    assert all(tool.name != "parallel_search" for tool in root_agent.tools)


def test_impact_instruction_receives_all_available_discovery_findings() -> None:
    class _Context:
        state = {
            LORE_OUTPUT_KEY: {"findings": [{"finding": "Lore evidence reached Impact"}]},
            TIMELINE_OUTPUT_KEY: {"findings": [{"finding": "Timeline evidence reached Impact"}]},
            RELATIONSHIP_OUTPUT_KEY: {
                "findings": [{"finding": "Relationship evidence reached Impact"}]
            },
        }

    instruction = build_impact_instruction(cast(Any, _Context()))

    assert "Lore evidence reached Impact" in instruction
    assert "Timeline evidence reached Impact" in instruction
    assert "Relationship evidence reached Impact" in instruction


def test_stewart_requires_impact_after_discovery_fan_in() -> None:
    assert "call `impact_agent` by" in STEWART_INSTRUCTION
    assert "itself in the next model turn" in STEWART_INSTRUCTION
    assert "Never call `impact_agent` in the same model response" in STEWART_INSTRUCTION


def test_adk_executes_discovery_delegations_concurrently_without_impact(monkeypatch) -> None:
    async def exercise() -> tuple[int, int]:
        session_service = InMemorySessionService()
        session = await session_service.create_session(
            app_name="concurrency-test",
            user_id="writer",
            session_id="investigation",
        )
        invocation_context = InvocationContext(
            session_service=session_service,
            invocation_id="invocation",
            agent=root_agent,
            session=session,
        )
        discovery_tools = [
            tool
            for tool in root_agent.tools
            if tool.name in {agent.name for agent in DISCOVERY_AGENTS}
        ]
        all_started = asyncio.Event()
        active = 0
        max_active = 0
        started = 0

        def concurrent_run():
            async def run_async(*, args, tool_context):
                nonlocal active, max_active, started
                active += 1
                started += 1
                max_active = max(max_active, active)
                if started == len(discovery_tools):
                    all_started.set()
                await asyncio.wait_for(all_started.wait(), timeout=0.5)
                active -= 1
                return {"ok": True}

            return run_async

        for tool in discovery_tools:
            monkeypatch.setattr(tool, "run_async", concurrent_run())

        function_calls = [
            types.FunctionCall(id=str(index), name=tool.name, args={"request": "investigate"})
            for index, tool in enumerate(discovery_tools)
        ]
        event = await handle_function_call_list_async(
            invocation_context,
            function_calls,
            {tool.name: tool for tool in discovery_tools},
        )
        assert event is not None
        return max_active, len(event.get_function_responses())

    max_active, response_count = asyncio.run(exercise())

    assert max_active == 3
    assert response_count == 3
