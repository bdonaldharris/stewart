import type {
  AgentId,
  AgentStatus,
  ConversationMessage,
  DiscoveryAgentId,
  DiscoveryResult,
  ImpactAnalysis,
  StewardshipReportData,
  WriterRoomEvent,
} from "./events";

export type ExperiencePhase = "entry" | "conversation" | "investigation" | "report";

export interface AgentViewState {
  id: AgentId;
  status: AgentStatus;
  activity: string;
}

export interface WriterRoomState {
  phase: ExperiencePhase;
  messages: ConversationMessage[];
  agents: Record<AgentId, AgentViewState>;
  completedInvestigations: Partial<Record<DiscoveryAgentId, DiscoveryResult>>;
  impact?: ImpactAnalysis;
  report?: StewardshipReportData;
  needsWriterInput: boolean;
}

function createAgentState(): Record<AgentId, AgentViewState> {
  return {
    lore: { id: "lore", status: "idle", activity: "Preparing investigation" },
    timeline: { id: "timeline", status: "idle", activity: "Preparing investigation" },
    relationship: { id: "relationship", status: "idle", activity: "Preparing investigation" },
    impact: { id: "impact", status: "waiting", activity: "Waiting for specialist findings" },
  };
}

export function createInitialState(): WriterRoomState {
  return {
    phase: "entry",
    messages: [],
    agents: createAgentState(),
    completedInvestigations: {},
    needsWriterInput: false,
  };
}

export function writerRoomReducer(
  state: WriterRoomState,
  event: WriterRoomEvent,
): WriterRoomState {
  switch (event.type) {
    case "writer_message":
      return {
        ...state,
        phase: state.phase === "entry" ? "conversation" : state.phase,
        messages: [...state.messages, event.message],
        needsWriterInput: false,
      };
    case "stewart_message":
      return {
        ...state,
        phase: state.phase === "entry" ? "conversation" : state.phase,
        messages: [...state.messages, event.message],
        needsWriterInput: Boolean(event.message.needsWriterInput),
      };
    case "investigation_started":
      return {
        ...state,
        phase: "investigation",
        needsWriterInput: false,
        agents: {
          ...state.agents,
          impact: {
            ...state.agents.impact,
            status: "waiting",
            activity: "Waiting for specialist findings",
          },
        },
      };
    case "specialist_status":
      return {
        ...state,
        agents: {
          ...state.agents,
          [event.agent]: {
            id: event.agent,
            status: event.status,
            activity: event.activity,
          },
        },
        needsWriterInput:
          event.status === "needs_information" ? true : state.needsWriterInput,
      };
    case "specialist_completed":
      return {
        ...state,
        agents: {
          ...state.agents,
          [event.result.agent]: {
            id: event.result.agent,
            status: "complete",
            activity: "Complete",
          },
        },
        completedInvestigations: {
          ...state.completedInvestigations,
          [event.result.agent]: event.result,
        },
      };
    case "impact_completed":
      return {
        ...state,
        impact: event.result,
        agents: {
          ...state.agents,
          impact: { id: "impact", status: "complete", activity: "Complete" },
        },
      };
    case "report_ready":
      return { ...state, phase: "report", report: event.report };
  }
}

export function reduceWriterRoomEvents(
  state: WriterRoomState,
  events: WriterRoomEvent[],
): WriterRoomState {
  return events.reduce(writerRoomReducer, state);
}
