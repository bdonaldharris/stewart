import type { AgentId } from "../model/events";
import type { AgentViewState } from "../model/state";

const agentDetails: Record<AgentId, { name: string; code: string; remit: string }> = {
  lore: {
    name: "Lore Agent",
    code: "LO",
    remit: "Canon & worldbuilding",
  },
  timeline: {
    name: "Timeline Agent",
    code: "TL",
    remit: "Chronology & dependencies",
  },
  relationship: {
    name: "Relationship Agent",
    code: "RL",
    remit: "Characters, teams & organizations",
  },
  impact: {
    name: "Impact Agent",
    code: "IM",
    remit: "Implications & tradeoffs",
  },
};

function statusLabel(state: AgentViewState): string {
  if (state.status === "needs_information") return "Needs information";
  if (state.status === "complete") return "Complete";
  if (state.status === "waiting") return "Waiting";
  if (state.status === "active") return "Investigating";
  return "Standby";
}

interface SpecialistCardProps {
  state: AgentViewState;
}

export function SpecialistCard({ state }: SpecialistCardProps) {
  const details = agentDetails[state.id];
  const isActive = state.status === "active";

  return (
    <article
      className={`specialist-card specialist-card-${state.status}`}
      data-testid={`agent-card-${state.id}`}
      data-status={state.status}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="agent-code">{details.code}</div>
          <div>
            <h3 className="agent-title">
              {details.name}
            </h3>
            <p className="agent-remit">{details.remit}</p>
          </div>
        </div>
        <span className={`status-label status-${state.status}`}>
          <span className={isActive ? "status-orbit" : "status-dot"} aria-hidden="true" />
          {statusLabel(state)}
        </span>
      </div>

      <div className={`activity-well ${isActive ? "activity-well-active" : ""}`}>
        <p>{state.activity}</p>
        {isActive && (
          <div className="activity-lines" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        )}
      </div>
    </article>
  );
}
