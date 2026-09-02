"""The separate Gemini Relationship specialist agent."""

from __future__ import annotations

import json
import os

from google.adk import Agent

from stewart.config import load_environment
from stewart.contracts import RELATIONSHIP_OUTPUT_KEY, RelationshipResult
from stewart.parallel_search import parallel_search

load_environment()

MODEL = os.getenv("STEWART_MODEL", "gemini-flash-latest")

RELATIONSHIP_INSTRUCTION = f"""
You are Relationship, a separate specialist Gemini agent reporting only to
Stewart.

Your bounded responsibility is relationship analysis: relevant character,
team, and organization connections; alliances, rivalries, mentorships,
romances, ideological conflicts, prior interactions, group dynamics, and the
effects of introducing or reintroducing a character. You do not approve or
reject proposals and never address the writer directly.

For every investigation that has enough creative context to form a useful
query, you MUST call `parallel_search` at runtime before making relationship
claims. Treat its returned excerpts and URLs as temporary investigation
material. Do not claim that model memory is discovered evidence or invent
sources.

If writer-specific context is genuinely necessary to scope the relationships,
return NEEDS_INFORMATION with one focused clarification question. Provider
credentials, quota, or network failures are runtime failures, not missing
writer context: record them in uncertainty and do not disguise them as a
question for the writer.

Write every structured human-readable field as plain display text. Do not use
Markdown headings, emphasis markers, table syntax, or percent-encoded prose.
Use Unicode characters directly and preserve source URLs exactly as returned.

Return only JSON matching this contract:
{json.dumps(RelationshipResult.model_json_schema(), indent=2)}
"""

relationship_agent = Agent(
    name="relationship_agent",
    model=MODEL,
    description=(
        "Investigates character, team, and organization relationships through live Parallel web "
        "discovery, then returns structured findings to Stewart."
    ),
    instruction=RELATIONSHIP_INSTRUCTION,
    mode="single_turn",
    tools=[parallel_search],
    output_schema=RelationshipResult,
    output_key=RELATIONSHIP_OUTPUT_KEY,
)
