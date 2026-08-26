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

function artifactMetadata(artifact: InvestigationArtifact): string {
  if (artifact.kind === "discovery") {
    return `${artifact.result.sources.length} sources · ${artifact.result.findings.length} findings`;
  }
  return `${artifact.result.affectedAreas.length} affected areas · ${artifact.result.tradeoffs.length} tradeoffs`;
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
    <section className="returned-investigations" aria-label="Returned Investigations">
      <div className="returned-heading">
        <div>
          <p className="eyebrow">Evidence received</p>
          <h2>Returned Investigations</h2>
        </div>
        <span>{artifacts.length} returned</span>
      </div>
      <div className="returned-row">
        {artifacts.map((artifact) => (
          <button
            key={artifact.agent}
            type="button"
            className="returned-card"
            onClick={() => setSelected(artifact)}
            aria-haspopup="dialog"
          >
            <span className="returned-card-topline">
              <strong>{investigationNames[artifact.agent]}</strong>
              <span className="complete-badge">Complete</span>
            </span>
            <span className="returned-card-meta">{artifactMetadata(artifact)}</span>
            <span className="returned-card-action">View investigation →</span>
          </button>
        ))}
      </div>
      {selected && (
        <InvestigationModal key={selected.agent} artifact={selected} onClose={closeModal} />
      )}
    </section>
  );
}
