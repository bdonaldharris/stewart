import { useCallback, useState } from "react";

import {
  discoveryAgentIds,
  type DiscoveryResult,
  type ImpactAnalysis,
} from "../model/events";
import {
  InvestigationModal,
  type InvestigationArtifact,
} from "./InvestigationModal";

const investigationNames = {
  lore: "Lore Investigation",
  timeline: "Timeline Investigation",
  relationship: "Relationship Investigation",
  impact: "Impact Investigation",
};

interface ReturnedInvestigationsProps {
  results: Partial<Record<(typeof discoveryAgentIds)[number], DiscoveryResult>>;
  impact?: ImpactAnalysis;
}

export function ReturnedInvestigations({ results, impact }: ReturnedInvestigationsProps) {
  const [selected, setSelected] = useState<InvestigationArtifact>();
  const closeModal = useCallback(() => setSelected(undefined), []);
  const artifacts: InvestigationArtifact[] = discoveryAgentIds.flatMap((agent) =>
    results[agent]
      ? [{ agent, kind: "discovery" as const, result: results[agent] }]
      : [],
  );

  if (impact) artifacts.push({ agent: "impact", kind: "impact", result: impact });
  if (artifacts.length === 0) return null;

  return (
    <div className="returned-investigations">
      <div className="returned-row">
        {artifacts.map((artifact) => (
          <button
            key={artifact.agent}
            type="button"
            className="returned-card"
            onClick={() => setSelected(artifact)}
            aria-haspopup="dialog"
            aria-label={`${investigationNames[artifact.agent]} View`}
          >
            <span className="returned-card-title">{investigationNames[artifact.agent]}</span>
            <span className="returned-card-view">View</span>
          </button>
        ))}
      </div>
      {selected && (
        <InvestigationModal key={selected.agent} artifact={selected} onClose={closeModal} />
      )}
    </div>
  );
}
