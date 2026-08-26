import { useEffect, useRef } from "react";

import type {
  DiscoveryAgentId,
  DiscoveryResult,
  ImpactAnalysis,
} from "../model/events";

export type InvestigationArtifact =
  | { agent: DiscoveryAgentId; kind: "discovery"; result: DiscoveryResult }
  | { agent: "impact"; kind: "impact"; result: ImpactAnalysis };

const investigationNames = {
  lore: "Lore Investigation",
  timeline: "Timeline Investigation",
  relationship: "Relationship Investigation",
  impact: "Impact Investigation",
};

function DetailList({ items }: { items: string[] }) {
  return (
    <ul className="modal-detail-list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function DiscoveryDetails({ result }: { result: DiscoveryResult }) {
  return (
    <>
      <p className="modal-summary">{result.summary}</p>

      <section className="modal-section">
        <h3>Findings</h3>
        <div className="modal-finding-list">
          {result.findings.map((finding) => (
            <article key={finding.id} className="modal-finding">
              <h4>{finding.title}</h4>
              <p>{finding.detail}</p>
              {finding.evidence.length > 0 && (
                <div className="modal-evidence">
                  <p className="modal-label">Evidence</p>
                  <DetailList items={finding.evidence} />
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="modal-section">
        <h3>Sources</h3>
        <ul className="source-list">
          {result.sources.map((source) => (
            <li key={source.id}>
              {source.url ? (
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.title}
                </a>
              ) : (
                <span>{source.title}</span>
              )}
              {source.note && <small>{source.note}</small>}
            </li>
          ))}
        </ul>
      </section>

      {result.assumptions.length > 0 && (
        <section className="modal-section modal-assumptions">
          <h3>Assumptions & uncertainty</h3>
          <DetailList items={result.assumptions} />
        </section>
      )}
    </>
  );
}

function ImpactDetails({ result }: { result: ImpactAnalysis }) {
  return (
    <>
      <p className="modal-summary">{result.summary}</p>
      <div className="modal-analysis-grid">
        <section className="modal-section">
          <h3>Risks</h3>
          <DetailList items={result.risks} />
        </section>
        <section className="modal-section">
          <h3>Opportunities</h3>
          <DetailList items={result.opportunities} />
        </section>
        <section className="modal-section">
          <h3>Affected areas</h3>
          <DetailList items={result.affectedAreas} />
        </section>
        <section className="modal-section">
          <h3>Future implications</h3>
          <DetailList items={result.futureImplications} />
        </section>
      </div>

      <section className="modal-section">
        <h3>Audience considerations</h3>
        <DetailList items={result.audienceConsiderations} />
      </section>

      <section className="modal-section">
        <h3>Options & tradeoffs</h3>
        <div className="modal-tradeoff-list">
          {result.tradeoffs.map((tradeoff) => (
            <article key={tradeoff.approach} className="modal-tradeoff">
              <h4>{tradeoff.approach}</h4>
              <div>
                <div>
                  <p className="modal-label">Benefits</p>
                  <DetailList items={tradeoff.benefits} />
                </div>
                <div>
                  <p className="modal-label">Tradeoffs</p>
                  <DetailList items={tradeoff.costs} />
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {result.assumptions.length > 0 && (
        <section className="modal-section modal-assumptions">
          <h3>Assumptions & uncertainty</h3>
          <DetailList items={result.assumptions} />
        </section>
      )}
    </>
  );
}

interface InvestigationModalProps {
  artifact: InvestigationArtifact;
  onClose: () => void;
}

export function InvestigationModal({ artifact, onClose }: InvestigationModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute("disabled"));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  const title = investigationNames[artifact.agent];
  const titleId = `investigation-modal-${artifact.agent}`;

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="investigation-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">Returned to Stewart</p>
            <h2 id={titleId}>{title}</h2>
          </div>
          <button ref={closeRef} type="button" className="modal-close" onClick={onClose}>
            <span aria-hidden="true">×</span>
            <span className="sr-only">Close investigation</span>
          </button>
        </header>
        <div className="modal-body">
          {artifact.kind === "discovery" ? (
            <DiscoveryDetails result={artifact.result} />
          ) : (
            <ImpactDetails result={artifact.result} />
          )}
        </div>
      </div>
    </div>
  );
}
