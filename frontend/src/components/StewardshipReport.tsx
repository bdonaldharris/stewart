import type { ImpactAnalysis, StewardshipReportData } from "../model/events";

interface StewardshipReportProps {
  report: StewardshipReportData;
  impact?: ImpactAnalysis;
  fixtureMode: boolean;
}

function ReportList({ items }: { items: string[] }) {
  return (
    <ul className="mt-4 space-y-3">
      {items.map((item) => (
        <li key={item} className="report-list-item">
          <span aria-hidden="true" />
          <p>{item}</p>
        </li>
      ))}
    </ul>
  );
}

export function StewardshipReport({ report, impact, fixtureMode }: StewardshipReportProps) {
  return (
    <article className="report-panel" aria-label="Stewardship Report">
      <header className="report-header">
        <div>
          <p className="eyebrow text-[#d4b47b]">Investigation complete</p>
          <h1 className="mt-3 text-3xl font-medium tracking-[-0.025em] text-white sm:text-4xl">
            Stewardship Report
          </h1>
        </div>
        <div className="report-seal" aria-hidden="true">
          S
        </div>
      </header>

      {fixtureMode && (
        <div className="fixture-notice mt-6">
          Development fixture · representative structured data · not live backend output
        </div>
      )}

      <section className="report-assessment">
        <p className="eyebrow">Stewart&apos;s Assessment</p>
        <p className="mt-4 max-w-4xl text-lg leading-8 text-slate-200 sm:text-xl">
          {report.assessment}
        </p>
      </section>

      <div className="report-grid">
        <section className="report-section">
          <p className="eyebrow">Continuity Considerations</p>
          <ReportList items={report.continuityConsiderations} />
        </section>
        <section className="report-section">
          <p className="eyebrow">Opportunities</p>
          <ReportList items={report.opportunities} />
        </section>
        <section className="report-section">
          <p className="eyebrow">Audience Considerations</p>
          <ReportList items={report.audienceConsiderations} />
        </section>
        <section className="report-section">
          <p className="eyebrow">Affected Areas</p>
          <ReportList items={impact?.affectedAreas ?? []} />
        </section>
      </div>

      <section className="mt-8 border-t border-white/8 pt-8">
        <p className="eyebrow">Options & Tradeoffs</p>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {report.options.map((option, index) => (
            <article key={option.title} className="option-card">
              <div className="flex items-center gap-3">
                <span className="option-number">0{index + 1}</span>
                <h3 className="text-base font-medium text-slate-100">{option.title}</h3>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-400">{option.description}</p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-[0.66rem] font-semibold tracking-[0.16em] text-emerald-200/70 uppercase">
                    Benefits
                  </p>
                  <ul className="mt-2 space-y-2 text-xs leading-5 text-slate-400">
                    {option.benefits.map((benefit) => (
                      <li key={benefit}>+ {benefit}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-[0.66rem] font-semibold tracking-[0.16em] text-amber-200/70 uppercase">
                    Tradeoffs
                  </p>
                  <ul className="mt-2 space-y-2 text-xs leading-5 text-slate-400">
                    {option.tradeoffs.map((tradeoff) => (
                      <li key={tradeoff}>— {tradeoff}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </article>
  );
}
