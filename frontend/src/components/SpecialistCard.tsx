import type { AgentId } from "../model/events";
import type { AgentViewState } from "../model/state";

const agentDetails: Record<AgentId, { name: string; code: string; remit: string; accent: string }> = {
  lore: {
    name: "Lore Agent",
    code: "LO",
    remit: "Canon & worldbuilding",
    accent: "agent-lore",
  },
  timeline: {
    name: "Timeline Agent",
    code: "TL",
    remit: "Chronology & dependencies",
    accent: "agent-timeline",
  },
  relationship: {
    name: "Relationship Agent",
    code: "RL",
    remit: "Characters, teams & organizations",
    accent: "agent-relationship",
  },
  impact: {
    name: "Impact Agent",
    code: "IM",
    remit: "Implications & tradeoffs",
    accent: "agent-impact",
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
  secondary?: boolean;
}

export function SpecialistCard({ state, secondary = false }: SpecialistCardProps) {
  const details = agentDetails[state.id];
  const isActive = state.status === "active";
  const isComplete = state.status === "complete";

  return (
    <article
      className={`specialist-card ${details.accent} ${secondary ? "specialist-card-secondary" : ""}`}
      data-testid={`agent-card-${state.id}`}
      data-status={state.status}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="agent-code">{details.code}</div>
          <div>
            <h3 className="text-sm font-semibold tracking-[0.02em] text-slate-100 sm:text-base">
              {details.name}
            </h3>
            <p className="mt-1 text-xs text-slate-500">{details.remit}</p>
          </div>
        </div>
        <span className={`status-label status-${state.status}`}>
          <span className={isActive ? "status-orbit" : "status-dot"} aria-hidden="true" />
          {statusLabel(state)}
        </span>
      </div>

      <div className={`activity-well ${isActive ? "activity-well-active" : ""}`}>
        <p className="text-sm text-slate-300">{state.activity}</p>
        {isActive && (
          <div className="activity-lines" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        )}
        {isComplete && <p className="mt-2 text-xs text-emerald-200/70">Returned to Stewart</p>}
      </div>
    </article>
  );
}
