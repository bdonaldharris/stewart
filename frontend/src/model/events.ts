export const discoveryAgentIds = ["lore", "timeline", "relationship"] as const;
export const agentIds = [...discoveryAgentIds, "impact"] as const;

export type DiscoveryAgentId = (typeof discoveryAgentIds)[number];
export type AgentId = (typeof agentIds)[number];
export type AgentStatus = "idle" | "waiting" | "active" | "complete" | "needs_information";

export interface EvidenceSource {
  id: string;
  title: string;
  url?: string;
  note?: string;
}

export interface InvestigationFinding {
  id: string;
  title: string;
  detail: string;
  evidence: string[];
  sourceIds: string[];
}

export interface DiscoveryResult {
  agent: DiscoveryAgentId;
  summary: string;
  findings: InvestigationFinding[];
  sources: EvidenceSource[];
  assumptions: string[];
}

export interface ImpactTradeoff {
  approach: string;
  benefits: string[];
  costs: string[];
}

export interface ImpactAnalysis {
  summary: string;
  risks: string[];
  opportunities: string[];
  affectedAreas: string[];
  futureImplications: string[];
  audienceConsiderations: string[];
  tradeoffs: ImpactTradeoff[];
  assumptions: string[];
}

export interface StewardshipOption {
  title: string;
  description: string;
  benefits: string[];
  tradeoffs: string[];
}

export interface StewardshipReportData {
  assessment: string;
  continuityConsiderations: string[];
  opportunities: string[];
  audienceConsiderations: string[];
  options: StewardshipOption[];
}

export interface ConversationMessage {
  id: string;
  speaker: "writer" | "stewart";
  text: string;
  needsWriterInput?: boolean;
}

export type WriterRoomEvent =
  | { type: "writer_message"; message: ConversationMessage }
  | { type: "stewart_message"; message: ConversationMessage }
  | { type: "investigation_started" }
  | { type: "specialist_status"; agent: AgentId; status: AgentStatus; activity: string }
  | { type: "specialist_completed"; result: DiscoveryResult }
  | { type: "impact_completed"; result: ImpactAnalysis }
  | { type: "report_ready"; report: StewardshipReportData };

export type WriterRoomEventBatch = WriterRoomEvent[];
