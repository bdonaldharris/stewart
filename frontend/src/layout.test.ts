import styles from "./index.css?raw";

describe("desktop workspace layout", () => {
  it("keeps page-level scrolling disabled while conversation and report scroll internally", () => {
    expect(styles).toMatch(/@media \(min-width: 1024px\)[\s\S]*body\s*{\s*overflow: hidden;/);
    expect(styles).toMatch(/\.conversation-scroll\s*{[\s\S]*?overflow-y: auto;/);
    expect(styles).toMatch(
      /@media \(min-width: 1024px\)[\s\S]*?\.report-panel\s*{[\s\S]*?overflow-y: auto;/,
    );
    expect(styles).toMatch(/\.modal-body\s*{[\s\S]*?overflow-y: auto;/);
  });
});
