# Stewart Architecture

## Overview

Stewart is a supervisor-agent architecture designed to help creative teams evaluate ideas within complex fictional universes.

Stewart coordinates specialized agents that investigate different aspects of continuity and synthesize findings into decision support for human creators.

## Core Components

## Stewart Agent

Stewart is the supervisor and concierge of the investigation.

Responsibilities:

- Maintain the writer conversation
- Understand creative intent
- Ask clarification questions
- Determine required specialist analysis
- Coordinate agent execution
- Synthesize findings
- Present options and tradeoffs

## Specialist Agents

### Lore Agent

Analyzes universe consistency, established rules, entities, and canon.

### Timeline Agent

Analyzes chronology, historical events, and temporal dependencies.

### Relationship Agent

Analyzes character, team, and organization relationships affected by a proposal.

### Impact Agent

Analyzes the combined consequences of the proposal and available discovery
findings: risks, opportunities, affected entities, future implications,
audience considerations, and tradeoffs. Impact has no Parallel access.

## Communication Model

All communication flows through Stewart.

Specialist agents do not communicate directly with writers or other specialists.

```text
Writer
  |
  v
Stewart
  |
  +--> Lore Agent ---------> Parallel
  +--> Timeline Agent ------> Parallel
  +--> Relationship Agent --> Parallel
  |
  +--> Impact Agent (after discovery fan-in)
  |
  v
Writer-facing synthesis or clarification
```

Stewart dynamically selects relevant specialists. When more than one selected
investigation is independent, Stewart emits those single-turn delegations
together and ADK executes them concurrently. Results fan back in to Stewart;
Stewart then invokes Impact with the combined session-scoped results. There is
no specialist-to-specialist path.

## Investigation Loop

1. Stewart receives a proposal.
2. Stewart determines whether clarification is needed.
3. Stewart delegates relevant investigations, concurrently when independent.
4. Specialists discover and analyze information through the shared Parallel tool.
5. Discovery specialists report completion or request additional context.
6. Stewart obtains missing information from the writer when necessary.
7. Stewart delegates completed discovery context to Impact.
8. Impact reports consequences or requests creative clarification through Stewart.
9. Stewart produces writer-facing guidance with findings, risks, opportunities,
   audience considerations, informed options, and tradeoffs.

## Knowledge Model

Stewart does not maintain a permanent universe database.

Information is dynamically discovered during investigations and used within temporary session context.

The system focuses on intelligent investigation rather than storing an entire fictional universe.
Multiple validated specialist results can coexist in the same in-memory session,
including across a writer clarification turn. Nothing is persisted after that session.
