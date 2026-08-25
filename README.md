# Stewart

## An Agentic MCU Continuity Stewardship System

Stewart is an agentic continuity stewardship system that helps MCU creative teams evaluate story ideas by discovering relevant knowledge, coordinating specialized AI analysis, and presenting human stewards with risks, opportunities, and tradeoffs.

## The Problem

Large interconnected fictional universes are difficult to steward. As the number of characters, stories, timelines, and creators grows, maintaining continuity becomes increasingly complex.

Creative teams need a way to evaluate new ideas against existing universe knowledge without replacing human creativity or decision-making.

## The Solution

Stewart acts as a conversational AI continuity steward. A writer brings a story idea to Stewart, and Stewart coordinates specialized agents to investigate how that idea fits within the existing universe.

Stewart does not replace creative decision-makers. Stewart helps them make informed decisions.

## How It Works

1. A writer presents a creative proposal.
2. Stewart determines whether additional context is needed.
3. Stewart coordinates specialized agents to investigate the proposal.
4. Specialist agents discover and analyze relevant information.
5. Stewart synthesizes findings into a stewardship report containing insights, options, and tradeoffs.

## Agent Team

### Stewart — Supervisor Agent

The concierge of the investigation. Stewart manages conversation, clarification, orchestration, and synthesis.

### Lore Agent

Evaluates universe rules, established canon, entities, and worldbuilding consistency.

### Timeline Agent

Evaluates chronology, historical events, and temporal placement.

### Relationship Agent

Evaluates character, team, and organization relationships affected by a proposal.

### Impact Agent

Evaluates broader narrative consequences, opportunities, and tradeoffs.

## Architecture Principles

- AI agents assist human stewards; they do not replace them.
- Knowledge is discovered dynamically rather than stored as a complete universe database.
- Investigation context is temporary and exists only for the active analysis session.
- Specialized agents provide expertise while Stewart coordinates the overall investigation.

## Project Documentation

- [Demo Scenario](docs/demo-scenario.md)
- [Architecture](docs/architecture.md)
- [Feature Slice](docs/feature-slice.md)

## Hackathon

Built for the Agentic Cinema: The Blockbuster Hackathon using Gemini and Google Cloud Agent Builder.

## First Vertical Slice

The executable slice proves this path:

```text
Writer proposal -> Stewart Gemini supervisor -> Lore Gemini specialist
                -> Parallel Search at runtime -> structured Lore result
                -> Stewart synthesis -> writer response
```

Stewart and Lore are separate Google ADK agents. Lore runs as Stewart's
`single_turn` subagent, so ADK supplies the delegation tool and automatically
returns control to Stewart. Lore stores its schema-validated result in the
turn's ADK state, and Stewart's runtime deterministically branches on
`COMPLETE` versus `NEEDS_INFORMATION`. Only Lore can call Parallel. Parallel
search is asynchronous, has an explicit timeout, and closes its scoped client
after each tool call. Retrieved excerpts exist only in the in-memory
investigation session; this slice adds no MCU data store or persistence.

### Local setup

Prerequisites:

- Python 3.11-3.13
- [`uv`](https://docs.astral.sh/uv/)
- A Gemini Developer API key, or Google Cloud Application Default Credentials
  for a Vertex AI project
- A Parallel API key

Install dependencies and create local configuration:

```bash
uv sync --extra dev
cp .env.example .env
```

For the Gemini Developer API, set:

```dotenv
GOOGLE_API_KEY=
PARALLEL_API_KEY=
```

For Vertex AI, authenticate Application Default Credentials and set:

```dotenv
GOOGLE_GENAI_USE_VERTEXAI=true
GOOGLE_CLOUD_PROJECT=
GOOGLE_CLOUD_LOCATION=global
PARALLEL_API_KEY=
```

`STEWART_MODEL` is optional and defaults to `gemini-flash-latest`. If
overridden, use a current Gemini 3 or newer model that supports function tools
with structured output.

### Run the slice

Pass a proposal directly:

```bash
uv run stewart "Introduce a cosmic archivist connected to the Nova Corps after Endgame."
```

Or run `uv run stewart` and enter the proposal at the prompt. If Lore returns
`NEEDS_INFORMATION`, Stewart asks the validated clarification question and the
CLI accepts the writer's answer in the same in-memory ADK session. Stewart can
then re-delegate to Lore with the accumulated investigation context. This loop
continues until Lore completes the investigation or the writer enters `exit`
or `quit`. Nothing is retained after the process exits.

### Run validation

Unit tests do not require credentials:

```bash
uv run pytest
uv run ruff check .
uv run ruff format --check .
```

The live integration test is opt-in because it calls both Gemini and Parallel:

```bash
RUN_STEWART_INTEGRATION=1 uv run pytest -m integration -s
```

It requires the same Gemini configuration used by the CLI plus
`PARALLEL_API_KEY`. The test verifies trace evidence that Stewart invoked the
separate Lore agent and Lore called `parallel_search`; it does not replace the
architecture with mocks.

### Implementation map

- `stewart/agent.py` — Stewart supervisor and ADK application
- `stewart/lore_agent.py` — separate Lore Gemini subagent
- `stewart/contracts.py` — typed Lore result and deterministic branch decision
- `stewart/parallel_search.py` — async official Parallel SDK integration
- `stewart/runtime.py` — production contract handling and multi-turn ADK session
- `stewart/cli.py` — clarification loop over one temporary investigation
- `tests/unit/` — production runtime, contract, Parallel, CLI, and topology tests
- `tests/integration/` — credentialed end-to-end agent trace test
