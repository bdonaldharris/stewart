import { discoveryAgentIds, type DiscoveryResult } from "../model/events";

const names = {
  lore: "Lore Investigation",
  timeline: "Timeline Investigation",
  relationship: "Relationship Investigation",
};

interface InvestigationSummaryProps {
  result: DiscoveryResult;
}

function InvestigationSummary({ result }: InvestigationSummaryProps) {
  return (
    <details className="investigation-summary group">
      <summary className="cursor-pointer list-none">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-100">
              <span className="mr-2 text-emerald-300">✓</span>
              {names[result.agent]}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              {result.sources.length} sources · {result.findings.length} findings
            </p>
          </div>
          <span className="details-toggle">View</span>
        </div>
      </summary>
      <div className="mt-4 border-t border-white/8 pt-4">
        <p className="text-xs leading-5 text-slate-400">{result.summary}</p>
        <div className="mt-4 space-y-4">
          {result.findings.map((finding) => (
            <article key={finding.id}>
              <h4 className="text-xs font-semibold text-slate-200">{finding.title}</h4>
              <p className="mt-1 text-xs leading-5 text-slate-400">{finding.detail}</p>
              {finding.evidence.map((evidence) => (
                <p key={evidence} className="evidence-line">
                  {evidence}
                </p>
              ))}
            </article>
          ))}
        </div>
        <div className="mt-5">
          <p className="eyebrow">Sources</p>
          <ul className="mt-2 space-y-2">
            {result.sources.map((source) => (
              <li key={source.id} className="text-xs text-slate-400">
                {source.url ? (
                  <a href={source.url} target="_blank" rel="noreferrer" className="source-link">
                    {source.title}
                  </a>
                ) : (
                  <span>{source.title}</span>
                )}
                {source.note && <span className="mt-0.5 block text-[0.68rem] text-slate-600">{source.note}</span>}
              </li>
            ))}
          </ul>
        </div>
        {result.assumptions.length > 0 && (
          <div className="mt-5 rounded-lg border border-amber-200/10 bg-amber-200/[0.03] p-3">
            <p className="eyebrow text-amber-200/60">Assumptions & uncertainty</p>
            {result.assumptions.map((assumption) => (
              <p key={assumption} className="mt-2 text-[0.7rem] leading-5 text-slate-500">
                {assumption}
              </p>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

interface CompletedInvestigationsProps {
  results: Partial<Record<(typeof discoveryAgentIds)[number], DiscoveryResult>>;
}

export function CompletedInvestigations({ results }: CompletedInvestigationsProps) {
  const completed = discoveryAgentIds.flatMap((agent) => (results[agent] ? [results[agent]] : []));
  if (completed.length === 0) return null;

  return (
    <section aria-label="Completed investigations">
      <div className="mb-3 flex items-center justify-between">
        <p className="eyebrow">Returned investigations</p>
        <span className="text-[0.66rem] text-slate-600">{completed.length} / 3</span>
      </div>
      <div className="space-y-3">
        {completed.map((result) => (
          <InvestigationSummary key={result.agent} result={result} />
        ))}
      </div>
    </section>
  );
}
