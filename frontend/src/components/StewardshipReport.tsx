import type { StewardshipReportData } from "../model/events";

interface StewardshipReportProps {
  report: StewardshipReportData;
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

export function StewardshipReport({ report }: StewardshipReportProps) {
  return (
    <article className="report-panel" aria-label="Stewardship Report">
      <header className="report-header">
        <div>
          <h1>
            Stewardship Report
          </h1>
        </div>
        <div className="report-seal" aria-hidden="true">
          S
        </div>
      </header>

      <section className="report-assessment">
        <p className="eyebrow">Stewart&apos;s Assessment</p>
        <p className="assessment-copy">
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
      </div>

      <section className="report-options">
        <p className="eyebrow">Options & Tradeoffs</p>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {report.options.map((option, index) => (
            <article key={option.title} className="option-card">
              <div className="flex items-center gap-3">
                <span className="option-number">0{index + 1}</span>
                <h3>{option.title}</h3>
              </div>
              {option.description && (
                <p className="option-description">{option.description}</p>
              )}
              <div className="option-columns">
                <div>
                  <p className="modal-label">
                    Benefits
                  </p>
                  <ul className="option-list">
                    {option.benefits.map((benefit) => (
                      <li key={benefit}>+ {benefit}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="modal-label">
                    Tradeoffs
                  </p>
                  <ul className="option-list">
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
