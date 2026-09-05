import { describe, expect, it } from "vitest";

import { createStewardshipReportPdfContent } from "./stewardshipReportPdfContent";

describe("StewardshipReportPdf", () => {
  it("uses only canonical report data and omits absent optional sections", () => {
    const content = createStewardshipReportPdfContent({
      assessment: "A concise assessment without Markdown artifacts.",
      continuityConsiderations: ["Keep the event anchored in continuity."],
      opportunities: [],
      audienceConsiderations: [],
      options: [
        {
          title: "Use a contained role",
          benefits: ["Lower continuity load"],
          tradeoffs: ["Less immediate reach"],
        },
      ],
    });

    expect(content.assessment).toBe("A concise assessment without Markdown artifacts.");
    expect(content.sections).toEqual([
      {
        title: "Continuity Considerations",
        items: ["Keep the event anchored in continuity."],
      },
    ]);
    expect(content.options).toEqual([
      {
        title: "Use a contained role",
        benefits: ["Lower continuity load"],
        tradeoffs: ["Less immediate reach"],
      },
    ]);
    expect(JSON.stringify(content)).not.toContain("Impact Investigation");
    expect(JSON.stringify(content)).not.toContain("Affected Areas");
  });
});
