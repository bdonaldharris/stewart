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

Analyzes broader consequences, opportunities, and tradeoffs based on specialist findings.

## Communication Model

All communication flows through Stewart.

Specialist agents do not communicate directly with writers or other specialists.

```text
Writer
  |
  v
Stewart
  |
  +--> Lore Agent
  |
  +--> Timeline Agent
  |
  +--> Relationship Agent
          |
          v
      Impact Agent
          |
          v
Stewardship Report
```

## Investigation Loop

1. Stewart receives a proposal.
2. Stewart determines whether clarification is needed.
3. Stewart delegates investigation.
4. Specialists discover and analyze information.
5. Specialists report completion or request additional context.
6. Stewart obtains missing information from the writer when necessary.
7. Stewart determines when enough information exists for synthesis.
8. Stewart produces a stewardship report.

## Knowledge Model

Stewart does not maintain a permanent universe database.

Information is dynamically discovered during investigations and used within temporary session context.

The system focuses on intelligent investigation rather than storing an entire fictional universe.
