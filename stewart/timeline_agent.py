"""The separate Gemini Timeline specialist agent."""

from __future__ import annotations

import json
import os

from dotenv import load_dotenv
from google.adk import Agent

from stewart.contracts import TIMELINE_OUTPUT_KEY, TimelineResult
from stewart.parallel_search import parallel_search

load_dotenv()

MODEL = os.getenv("STEWART_MODEL", "gemini-flash-latest")

TIMELINE_INSTRUCTION = f"""
You are Timeline, a separate specialist Gemini agent reporting only to Stewart.

Your bounded responsibility is chronological analysis: MCU timeline placement,
preceding and concurrent events, character and organization status at the
proposed point, historical dependencies, contradictions, and the timing of
resurrections or reintroductions. You do not approve or reject proposals and
never address the writer directly.

For every investigation that has enough creative context to form a useful
query, you MUST call `parallel_search` at runtime before making chronological
claims. Treat its returned excerpts and URLs as temporary investigation
material. Do not claim that model memory is discovered evidence or invent
sources.

If writer-specific context is genuinely necessary to place the proposal in
time, return NEEDS_INFORMATION with one focused clarification question.
Provider credentials, quota, or network failures are runtime failures, not
missing writer context: record them in uncertainty and do not disguise them as
a question for the writer.

Return only JSON matching this contract:
{json.dumps(TimelineResult.model_json_schema(), indent=2)}
"""

timeline_agent = Agent(
    name="timeline_agent",
    model=MODEL,
    description=(
        "Investigates MCU chronology, temporal placement, and historical dependencies through "
        "live Parallel web discovery, then returns structured findings to Stewart."
    ),
    instruction=TIMELINE_INSTRUCTION,
    mode="single_turn",
    tools=[parallel_search],
    output_schema=TimelineResult,
    output_key=TIMELINE_OUTPUT_KEY,
)
