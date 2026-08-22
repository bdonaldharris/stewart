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
