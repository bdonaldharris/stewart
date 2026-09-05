import { createElement, type ComponentProps, type ReactElement } from "react";
import type { Document } from "@react-pdf/renderer";

import type { StewardshipReportData } from "../model/events";

export const STEWARDSHIP_REPORT_FILENAME = "stewart-stewardship-report.pdf";

export async function exportStewardshipReport(report: StewardshipReportData): Promise<void> {
  const [{ pdf }, { StewardshipReportPdf }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("../components/StewardshipReportPdf"),
  ]);
  const reportDocument = createElement(StewardshipReportPdf, { report }) as unknown as ReactElement<
    ComponentProps<typeof Document>
  >;
  const blob = await pdf(reportDocument).toBlob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  try {
    anchor.href = objectUrl;
    anchor.download = STEWARDSHIP_REPORT_FILENAME;
    anchor.style.display = "none";
    document.body.append(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  }
}
