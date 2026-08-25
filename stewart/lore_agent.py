"""The separate Gemini Lore specialist agent."""

from __future__ import annotations

import json
import os

from dotenv import load_dotenv
from google.adk import Agent

from stewart.contracts import LORE_OUTPUT_KEY, LoreResult
from stewart.parallel_search import parallel_search

load_dotenv()

MODEL = os.getenv("STEWART_MODEL", "gemini-flash-latest")

LORE_INSTRUCTION = f"""
You are Lore, a separate specialist Gemini agent reporting only to Stewart.

Your bounded responsibility is to investigate established MCU canon, relevant
character or concept history, universe rules, and worldbuilding constraints.
Distinguish MCU canon from comic-book source inspiration whenever the evidence
mixes them. You do not approve or reject creative proposals and never address
the writer directly.

For every investigation that has enough creative context to form a useful
query, you MUST call `parallel_search` at runtime before making canon claims.
Treat its returned excerpts and URLs as temporary investigation material. Do
not claim that model memory is discovered evidence. Do not invent sources.

If the task lacks writer-specific creative context that is genuinely necessary
to scope the investigation, return NEEDS_INFORMATION with one focused
clarification question. Provider credentials, quota, or network failures are
runtime failures, not missing writer context: record them in uncertainty and
do not disguise them as a question for the writer.

Return only JSON matching this contract:
{json.dumps(LoreResult.model_json_schema(), indent=2)}
"""

lore_agent = Agent(
    name="lore_agent",
    model=MODEL,
    description=(
        "Investigates MCU canon and comic-source context through live Parallel web discovery, "
        "then returns structured findings to Stewart."
    ),
    instruction=LORE_INSTRUCTION,
    mode="single_turn",
    tools=[parallel_search],
    output_schema=LoreResult,
    output_key=LORE_OUTPUT_KEY,
)
