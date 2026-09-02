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

Analyzes combined narrative consequences, risks, opportunities, audience
considerations, future implications, and creative tradeoffs.

## Architecture Principles

- AI agents assist human stewards; they do not replace them.
- Knowledge is discovered dynamically rather than stored as a complete universe database.
- Investigation context is temporary and exists only for the active analysis session.
- Specialized agents provide expertise while Stewart coordinates the overall investigation.

## Project Documentation

- [Demo Scenario](docs/demo-scenario.md)
- [Architecture](docs/architecture.md)
- [Feature Slice](docs/feature-slice.md)
- [Technology Stack](docs/technology-stack.md)

## Hackathon

Built for the Agentic Cinema: The Blockbuster Hackathon using Gemini and Google Cloud Agent Builder.

## Discovery-to-Impact Slice

The executable slice proves this path:

```text
                   +-> Lore ---------> Parallel --+
                   +-> Timeline -----> Parallel --+
Writer -> Stewart -+-> Relationship -> Parallel --+-> Impact -> Stewart -> Writer
```

Stewart and its four specialists are separate Google ADK agents. Lore,
Timeline, and Relationship run as independent `single_turn` discovery agents.
Stewart selects only the domains relevant to a proposal and emits those
delegations together; ADK executes multiple tool calls concurrently and returns
every result to Stewart. Stewart then delegates the combined session-scoped
findings to Impact in the next model turn. Specialists communicate only with
Stewart, never with one another or the writer.

Each specialist stores a schema-validated result in ADK session state, and the
runtime deterministically branches on the accumulated `COMPLETE` and
`NEEDS_INFORMATION` statuses, with an observable `ANALYZE_IMPACT` stage between
completed discovery and final synthesis. The three discovery specialists can
call the same shared Parallel tool; Stewart and Impact cannot. Impact receives
the available discovery result keys directly from temporary ADK session state.
Parallel search is asynchronous, has an explicit timeout, and closes its scoped
client after each tool call. Nothing is persisted after the investigation.

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
cp .env.example .env.local
```

Stewart loads `.env.local` first for local overrides, then uses `.env` only to
fill values that are still missing. Both files are ignored by Git.

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

Or run `uv run stewart` and enter the proposal at the prompt. The CLI shows
concise operational statuses for discovery and Impact. If any specialist
returns `NEEDS_INFORMATION`, Stewart asks for the needed clarification and the
CLI accepts the writer's answer in the same in-memory ADK session. Stewart can
then re-delegate to Impact and/or affected discovery specialists while
retaining completed results. Nothing is retained after the process exits.

### Run the Writer's Room frontend

The Writer's Room lives in `frontend/` and presents the Stewart-led flow as an
event-driven browser experience: writer conversation, live specialist
activity, completed investigation artifacts, Impact analysis after discovery
fans in, and a final stewardship report.

For the live local experience, start the server-side browser transport from the
repository root in one terminal:

```bash
uv sync --extra dev
uv run stewart-web
```

The transport listens on `http://127.0.0.1:8000`, creates one in-memory
`StewartConversation` per browser session, and reads Gemini, Vertex AI, and
Parallel configuration from the server process's `.env.local`/environment.
Secrets never enter the Vite process or browser event payloads.

In a second terminal, start Vite in live-backend mode:

```bash
cd frontend
npm install
VITE_STEWART_DEMO_FIXTURE=false npm run dev
```

Open `http://localhost:5173`. Vite proxies only `/api` requests to the local
Python transport. The entry screen should show the Writer's Room with the chat
input focused. Enter the proposal yourself; specialist activity and completed
results arrive from the real ADK run as newline-delimited streamed events. If
Stewart requests clarification, answer in the same browser conversation so the
existing in-memory ADK session continues.

Fixture mode remains the default for UI-only development and requires neither
the Python transport nor provider credentials:

```bash
cd frontend
npm run dev
```

The fixture preserves the same typed frontend contract, clarification path,
specialist progression, Impact stage, and final report flow. Set
`VITE_STEWART_DEMO_FIXTURE=true` explicitly when a local environment already
defines a different value.

Frontend validation and production output:

```bash
npm run lint
npm test
npm run build
```

Vercel configuration is included in `frontend/vercel.json`, with
`frontend/` as the deployment root.

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
`PARALLEL_API_KEY`. The test accepts either valid contract status from each
specialist. When discovery completes, it verifies that Impact runs afterward
and returns useful structured analysis. Completed discovery results must
contain Parallel evidence; the test does not replace the architecture with
mocks.

### Implementation map

- `stewart/agent.py` — Stewart supervisor and ADK application
- `stewart/lore_agent.py` — separate Lore Gemini subagent
- `stewart/timeline_agent.py` — separate Timeline Gemini subagent
- `stewart/relationship_agent.py` — separate Relationship Gemini subagent
- `stewart/impact_agent.py` — separate Impact Gemini synthesis subagent
- `stewart/contracts.py` — typed specialist results and deterministic branch decisions
- `stewart/parallel_search.py` — async official Parallel SDK integration
- `stewart/runtime.py` — accumulated contract handling and multi-turn ADK session
- `stewart/cli.py` — clarification loop over one temporary investigation
- `tests/unit/` — production runtime, contract, Parallel, CLI, and topology tests
- `tests/integration/` — credentialed end-to-end agent trace test
