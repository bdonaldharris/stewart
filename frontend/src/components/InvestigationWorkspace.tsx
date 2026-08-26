import { agentIds } from "../model/events";
import type { WriterRoomState } from "../model/state";
import { SpecialistCard } from "./SpecialistCard";

interface InvestigationWorkspaceProps {
  state: WriterRoomState;
}

export function InvestigationWorkspace({ state }: InvestigationWorkspaceProps) {
  const participatingAgents = agentIds.filter((agent) => {
    const status = state.agents[agent].status;
    return status !== "complete" && status !== "idle";
  });

  if (participatingAgents.length === 0) return null;

  return (
    <section className="specialist-workspace" aria-label="Specialist Workspace">
      <div className="workspace-section-heading">
        <div>
          <p className="eyebrow">Coordinated investigation</p>
          <h2 className="section-title">
            Specialist Workspace
          </h2>
        </div>
        <div className="coordinating-label">
          <span aria-hidden="true" />
          Stewart is coordinating
        </div>
      </div>
      <div className="specialist-grid">
        {participatingAgents.map((agent) => (
          <SpecialistCard key={agent} state={state.agents[agent]} />
        ))}
      </div>
    </section>
  );
}
