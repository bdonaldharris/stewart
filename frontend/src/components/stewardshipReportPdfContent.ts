import type { StewardshipReportData } from "../model/events";

export interface StewardshipReportPdfContent {
  assessment: string;
  sections: Array<{ title: string; items: string[] }>;
  options: StewardshipReportData["options"];
}

export function createStewardshipReportPdfContent(
  report: StewardshipReportData,
): StewardshipReportPdfContent {
  return {
    assessment: report.assessment,
    sections: [
      { title: "Continuity Considerations", items: report.continuityConsiderations },
      { title: "Opportunities", items: report.opportunities },
      { title: "Audience Considerations", items: report.audienceConsiderations },
    ].filter((section) => section.items.length > 0),
    options: report.options,
  };
}
