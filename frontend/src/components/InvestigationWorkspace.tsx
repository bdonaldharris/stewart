import { agentIds } from "../model/events";
import type { WriterRoomState } from "../model/state";
import { SpecialistCard } from "./SpecialistCard";

interface InvestigationWorkspaceProps {
  state: WriterRoomState;
  secondary?: boolean;
}

export function InvestigationWorkspace({ state, secondary = false }: InvestigationWorkspaceProps) {
  return (
    <section className={secondary ? "mt-8" : ""} aria-label="Specialist investigation workspace">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Coordinated investigation</p>
          <h2 className={`${secondary ? "mt-1 text-lg" : "mt-2 text-2xl"} font-medium text-slate-100`}>
            Specialist workspace
          </h2>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="h-1.5 w-1.5 rounded-full bg-[#d4b47b]" />
          Stewart is coordinating
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {agentIds.map((agent) => (
          <SpecialistCard key={agent} state={state.agents[agent]} secondary={secondary} />
        ))}
      </div>
    </section>
  );
}
