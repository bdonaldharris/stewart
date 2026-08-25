# Technology Stack

Stewart's technology choices are intentionally optimized for the Agentic Cinema hackathon: rapid implementation, clear agent boundaries, a compelling interactive demo, and minimal infrastructure overhead.

## Frontend

- **React** — user interface framework
- **Vite** — frontend build tooling and local development
- **Tailwind CSS** — styling and visual system

The frontend will implement the Writer's Room experience: conversational interaction with Stewart, visible specialist activity, completed investigation summaries, expandable findings, and the final stewardship analysis.

## Frontend Hosting

- **Vercel**

Vercel will host the React frontend.

## Agent Backend

- **Python** — backend implementation language
- **Google Agent Development Kit (ADK)** — multi-agent framework
- **Gemini** — reasoning model for Stewart and specialist agents

Stewart is the supervisor agent and the only writer-facing agent. Lore,
Timeline, Relationship, and Impact are separate Gemini specialist agents
coordinated by Stewart.

## Discovery

- **Parallel**

Lore, Timeline, and Relationship use Parallel at runtime to discover the
information required for the active investigation. Impact analyzes their
combined findings without direct Parallel access. Stewart does not maintain a
permanent MCU knowledge base.

## Investigation State

- **In-memory, session-scoped state**
- **No persistent MCU knowledge store**

Discovered information and specialist findings exist only for the active investigation and are discarded when the session ends. Historical investigation persistence is outside the current hackathon scope.

## Backend Hosting

**TBD**

The Python/ADK backend hosting target has not yet been selected. This decision will be made based on the simplest deployment path that satisfies the hackathon's Google Cloud requirements and supports the live demo.

## Current Stack Summary

```text
Frontend
├── React
├── Vite
└── Tailwind CSS

Frontend Hosting
└── Vercel

Agent Backend
├── Python
├── Google ADK
└── Gemini

Discovery
└── Parallel

Investigation State
└── In-memory / session-scoped

Backend Hosting
└── TBD
```

These choices are project decisions for the current hackathon build. They may be refined as implementation and deployment requirements become clearer.
