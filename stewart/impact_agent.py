"""The separate Gemini Impact synthesis specialist agent."""

from __future__ import annotations

import json
import os
from typing import Any

from google.adk import Agent
from google.adk.agents.readonly_context import ReadonlyContext
from pydantic import BaseModel

from stewart.config import load_environment
from stewart.contracts import (
    IMPACT_OUTPUT_KEY,
    LORE_OUTPUT_KEY,
    RELATIONSHIP_OUTPUT_KEY,
    TIMELINE_OUTPUT_KEY,
    ImpactResult,
)

load_environment()

MODEL = os.getenv("STEWART_MODEL", "gemini-flash-latest")
DISCOVERY_OUTPUT_KEYS = (
    LORE_OUTPUT_KEY,
    TIMELINE_OUTPUT_KEY,
    RELATIONSHIP_OUTPUT_KEY,
)


def _json_default(value: Any) -> Any:
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json")
    raise TypeError(f"Cannot serialize {type(value).__name__}")


def build_impact_instruction(context: ReadonlyContext) -> str:
    """Inject completed discovery results into Impact's analysis context."""
    discovery_results = {
        output_key: context.state[output_key]
        for output_key in DISCOVERY_OUTPUT_KEYS
        if output_key in context.state
    }
    serialized_results = json.dumps(
        discovery_results,
        default=_json_default,
        indent=2,
        sort_keys=True,
    )
    return f"""
You are Impact, a separate specialist Gemini agent reporting only to Stewart.

Answer: What happens if the creative team makes this decision?

Analyze the delegated writer proposal and the discovery results below. Assess
narrative weight, consequence scale, affected characters/teams/organizations
and open storylines, future dependencies and opportunities, audience-facing
continuity expectations, risks, upside, and meaningful alternative tradeoffs.
Do not reduce audience considerations to popularity prediction.

Do not duplicate Lore, Timeline, or Relationship discovery. You have no
Parallel tool. Treat the supplied results as your factual basis. If factual
discovery is still required, report that gap to Stewart in uncertainty. If
writer-specific creative intent is required, return NEEDS_INFORMATION with one
focused clarification question. Never address the writer directly and never
approve or reject the proposal.

Available session-scoped discovery results (missing specialists were not
relevant or have not completed):
{serialized_results}

Return only JSON matching this contract:
{json.dumps(ImpactResult.model_json_schema(), indent=2)}
"""


impact_agent = Agent(
    name="impact_agent",
    model=MODEL,
    description=(
        "Analyzes the combined implications, risks, opportunities, audience considerations, "
        "and tradeoffs from Stewart's writer context and completed discovery findings."
    ),
    instruction=build_impact_instruction,
    mode="single_turn",
    tools=[],
    output_schema=ImpactResult,
    output_key=IMPACT_OUTPUT_KEY,
)
