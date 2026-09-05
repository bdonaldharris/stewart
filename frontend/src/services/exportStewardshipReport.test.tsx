import { afterEach, describe, expect, it, vi } from "vitest";

import type { StewardshipReportData } from "../model/events";

const toBlob = vi.hoisted(() => vi.fn());
const createPdf = vi.hoisted(() => vi.fn(() => ({ toBlob })));

vi.mock("@react-pdf/renderer", () => ({ pdf: createPdf }));
vi.mock("../components/StewardshipReportPdf", () => ({
  StewardshipReportPdf: () => null,
}));

import {
  exportStewardshipReport,
  STEWARDSHIP_REPORT_FILENAME,
} from "./exportStewardshipReport";

const report: StewardshipReportData = {
  assessment: "A concise normalized assessment.",
  continuityConsiderations: ["Keep the proposal anchored."],
  opportunities: [],
  audienceConsiderations: [],
  options: [],
};

const originalCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
const originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");

function restore(target: object, key: PropertyKey, descriptor?: PropertyDescriptor) {
  if (descriptor) Object.defineProperty(target, key, descriptor);
  else Reflect.deleteProperty(target, key);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  restore(URL, "createObjectURL", originalCreateObjectUrl);
  restore(URL, "revokeObjectURL", originalRevokeObjectUrl);
});

describe("exportStewardshipReport", () => {
  it("creates the required filename download and cleans up its temporary object URL", async () => {
    const blob = new Blob(["PDF"], { type: "application/pdf" });
    const createObjectUrl = vi.fn(() => "blob:stewart-report");
    const revokeObjectUrl = vi.fn();
    const download = vi.fn();
    toBlob.mockResolvedValueOnce(blob);
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectUrl });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function click(
      this: HTMLAnchorElement,
    ) {
      download({ href: this.href, download: this.download });
    });

    await exportStewardshipReport(report);

    expect(createPdf).toHaveBeenCalledOnce();
    expect(toBlob).toHaveBeenCalledOnce();
    expect(download).toHaveBeenCalledWith({
      href: "blob:stewart-report",
      download: STEWARDSHIP_REPORT_FILENAME,
    });
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:stewart-report");
  });
});
