import type {
  ConversationMessage,
  DiscoveryResult,
  ImpactAnalysis,
  StewardshipReportData,
  WriterRoomEventBatch,
} from "../model/events";
import type { WriterRoomEventSource } from "../services/eventSource";

interface DemoFixtureOptions {
  clarificationFirst?: boolean;
}

function excerpt(value: string, length = 88): string {
  return value.length > length ? `${value.slice(0, length).trim()}…` : value;
}

function fixtureSource(id: string, title: string) {
  return {
    id,
    title,
    note: "Representative fixture source slot — not live discovery.",
  };
}

function loreResult(proposal: string): DiscoveryResult {
  return {
    agent: "lore",
    summary: `Fixture review of the continuity rules implied by “${excerpt(proposal)}”.`,
    findings: [
      {
        id: "lore-rule",
        title: "The new story rule needs a clear boundary",
        detail:
          "The live investigation would compare the proposal's memory-preservation mechanic with established universe rules and exceptions.",
        evidence: ["Representative evidence excerpt would appear here after Parallel discovery."],
        sourceIds: ["lore-source-1", "lore-source-2"],
      },
      {
        id: "lore-scope",
        title: "Canon and source inspiration must remain separated",
        detail:
          "Stewart should distinguish cinematic continuity evidence from optional source-material inspiration.",
        evidence: ["Fixture evidence slot for an MCU source and a separate inspiration source."],
        sourceIds: ["lore-source-2", "lore-source-3"],
      },
    ],
    sources: [
      fixtureSource("lore-source-1", "Fixture canon evidence packet"),
      fixtureSource("lore-source-2", "Fixture universe-rules brief"),
      fixtureSource("lore-source-3", "Fixture source-inspiration brief"),
    ],
    assumptions: ["This is representative UI data, not a live MCU canon finding."],
  };
}

function timelineResult(): DiscoveryResult {
  return {
    agent: "timeline",
    summary: "Fixture chronology review of placement, dependencies, and character availability.",
    findings: [
      {
        id: "timeline-anchor",
        title: "The proposal needs an explicit chronological anchor",
        detail:
          "A live result would identify the preceding event, concurrent projects, and the intended elapsed time.",
        evidence: ["Representative chronology evidence slot."],
        sourceIds: ["timeline-source-1"],
      },
      {
        id: "timeline-dependency",
        title: "Later stories may inherit this placement",
        detail:
          "Introducing a recurring concept creates a temporal dependency for subsequent appearances.",
        evidence: ["Representative project-order evidence slot."],
        sourceIds: ["timeline-source-2"],
      },
    ],
    sources: [
      fixtureSource("timeline-source-1", "Fixture chronology brief"),
      fixtureSource("timeline-source-2", "Fixture project-order reference"),
    ],
    assumptions: ["Exact placement would be confirmed by live discovery."],
  };
}

function relationshipResult(): DiscoveryResult {
  return {
    agent: "relationship",
    summary: "Fixture relationship review of the proposal's stated team and organization ties.",
    findings: [
      {
        id: "relationship-entry",
        title: "The introduction changes an existing group dynamic",
        detail:
          "A live investigation would map prior interactions, current loyalties, and unresolved tensions before recommending an entry point.",
        evidence: ["Representative relationship-map evidence slot."],
        sourceIds: ["relationship-source-1"],
      },
      {
        id: "relationship-tension",
        title: "Alliance and rivalry can coexist",
        detail:
          "The proposal has room for productive tension without displacing the established emotional center of the group.",
        evidence: ["Representative prior-interaction evidence slot."],
        sourceIds: ["relationship-source-2"],
      },
    ],
    sources: [
      fixtureSource("relationship-source-1", "Fixture relationship map"),
      fixtureSource("relationship-source-2", "Fixture prior-interactions brief"),
    ],
    assumptions: ["The live agent would verify every stated relationship."],
  };
}

const impactAnalysis: ImpactAnalysis = {
  summary:
    "A recurring supporting role creates useful connective tissue, but it also establishes a rule and relationship commitments that future stories must honor.",
  risks: [
    "The new mechanic could solve conflicts too easily unless its limits are explicit.",
    "A large first appearance could crowd unresolved arcs belonging to established characters.",
  ],
  opportunities: [
    "Use the character as a bridge between otherwise separate cosmic storylines.",
    "Turn preserved memories into an emotional cost rather than a simple information device.",
  ],
  affectedAreas: ["Character arcs", "Team dynamics", "Cosmic organizations", "Future chronology"],
  futureImplications: [
    "Subsequent projects inherit the mechanic's limits.",
    "A recurring role creates sequel and post-credit setup options.",
  ],
  audienceConsiderations: [
    "Knowledgeable viewers will expect the new rule to be applied consistently.",
    "The character's arrival should deepen existing relationships rather than bypass them.",
  ],
  tradeoffs: [
    {
      approach: "Introduce as a contained supporting role",
      benefits: ["Lower continuity load", "Space to establish clear limits"],
      costs: ["Less immediate franchise momentum"],
    },
    {
      approach: "Position as a recurring connective character",
      benefits: ["Stronger cross-project utility", "Natural future story paths"],
      costs: ["More timeline and relationship commitments"],
    },
  ],
  assumptions: ["Representative fixture analysis only; live Impact output may differ."],
};

const stewardshipReport: StewardshipReportData = {
  assessment:
    "The proposal is strongest as a deliberately bounded recurring role. Its value comes from connecting existing arcs, while its primary continuity burden is defining limits that future projects can apply consistently.",
  continuityConsiderations: [
    "Anchor the introduction to a specific point in the timeline.",
    "Define what can and cannot be preserved before the mechanic resolves a story problem.",
    "Protect the emotional ownership of established character relationships.",
  ],
  opportunities: impactAnalysis.opportunities,
  audienceConsiderations: impactAnalysis.audienceConsiderations,
  options: impactAnalysis.tradeoffs.map((tradeoff) => ({
    title: tradeoff.approach,
    description: "A viable creative path with a different balance of narrative reach and continuity load.",
    benefits: tradeoff.benefits,
    tradeoffs: tradeoff.costs,
  })),
};

class DemoFixtureEventSource implements WriterRoomEventSource {
  readonly mode = "fixture" as const;
  private sequenceIndex = 0;
  private messageIndex = 0;
  private proposal = "";
  private started = false;
  private awaitingClarification: boolean;

  constructor(options: DemoFixtureOptions) {
    this.awaitingClarification = Boolean(options.clarificationFirst);
  }

  get canAdvance(): boolean {
    return this.started && this.sequenceIndex < 5;
  }

  async sendMessage(message: string): Promise<WriterRoomEventBatch> {
    const writerMessage = this.message("writer", message);
    if (!this.proposal) {
      this.proposal = message;
      if (this.awaitingClarification) {
        return [
          { type: "writer_message", message: writerMessage },
          {
            type: "stewart_message",
            message: this.message(
              "stewart",
              "Before I begin: what point in the MCU timeline should frame this proposal?",
              true,
            ),
          },
        ];
      }
      return [{ type: "writer_message", message: writerMessage }, ...this.startInvestigation()];
    }

    if (this.awaitingClarification) {
      this.awaitingClarification = false;
      return [
        { type: "writer_message", message: writerMessage },
        {
          type: "stewart_message",
          message: this.message(
            "stewart",
            "Thank you. I have enough context to begin the coordinated investigation.",
          ),
        },
        ...this.startInvestigation(),
      ];
    }

    return [
      { type: "writer_message", message: writerMessage },
      {
        type: "stewart_message",
        message: this.message(
          "stewart",
          "This development fixture has completed its scripted investigation sequence.",
        ),
      },
    ];
  }

  async advance(): Promise<WriterRoomEventBatch> {
    const batches = this.sequence();
    const batch = batches[this.sequenceIndex] ?? [];
    this.sequenceIndex += 1;
    return batch;
  }

  private startInvestigation(): WriterRoomEventBatch {
    this.started = true;
    return [
      {
        type: "stewart_message",
        message: this.message(
          "stewart",
          "I’m coordinating Lore, Timeline, and Relationship now. Impact will begin after their findings return.",
        ),
      },
      { type: "investigation_started" },
      { type: "specialist_status", agent: "lore", status: "active", activity: "Searching sources" },
      {
        type: "specialist_status",
        agent: "timeline",
        status: "active",
        activity: "Checking chronology",
      },
      {
        type: "specialist_status",
        agent: "relationship",
        status: "active",
        activity: "Mapping relationships",
      },
      {
        type: "specialist_status",
        agent: "impact",
        status: "waiting",
        activity: "Waiting for specialist findings",
      },
    ];
  }

  private sequence(): WriterRoomEventBatch[] {
    return [
      [
        { type: "specialist_completed", result: loreResult(this.proposal) },
        {
          type: "specialist_status",
          agent: "timeline",
          status: "active",
          activity: "Reviewing evidence",
        },
      ],
      [{ type: "specialist_completed", result: timelineResult() }],
      [
        { type: "specialist_completed", result: relationshipResult() },
        {
          type: "specialist_status",
          agent: "impact",
          status: "active",
          activity: "Analyzing implications",
        },
      ],
      [
        { type: "impact_completed", result: impactAnalysis },
      ],
      [
        { type: "report_ready", report: stewardshipReport },
        {
          type: "stewart_message",
          message: this.message(
            "stewart",
            "The investigation is complete. I’ve organized the continuity considerations, opportunities, and tradeoffs for your review.",
          ),
        },
      ],
    ];
  }

  private message(
    speaker: ConversationMessage["speaker"],
    text: string,
    needsWriterInput = false,
  ): ConversationMessage {
    this.messageIndex += 1;
    return {
      id: `fixture-message-${this.messageIndex}`,
      speaker,
      text,
      needsWriterInput,
    };
  }
}

export function createDemoFixture(options: DemoFixtureOptions = {}): WriterRoomEventSource {
  return new DemoFixtureEventSource(options);
}
