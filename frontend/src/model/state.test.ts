import { createDemoFixture } from "../fixtures/demoFixture";
import { createInitialState, reduceWriterRoomEvents } from "./state";

describe("Writer's Room event reducer", () => {
  it("preserves concurrent discovery, fan-in, Impact, and report transitions", async () => {
    const source = createDemoFixture();
    let state = createInitialState();

    state = reduceWriterRoomEvents(
      state,
      await source.sendMessage("Introduce a recurring cosmic archivist after a major event."),
    );

    expect(state.phase).toBe("investigation");
    expect(state.agents.lore.status).toBe("active");
    expect(state.agents.timeline.status).toBe("active");
    expect(state.agents.relationship.status).toBe("active");
    expect(state.agents.impact.status).toBe("waiting");

    state = reduceWriterRoomEvents(state, await source.advance());
    state = reduceWriterRoomEvents(state, await source.advance());
    state = reduceWriterRoomEvents(state, await source.advance());

    expect(Object.keys(state.completedInvestigations)).toEqual([
      "lore",
      "timeline",
      "relationship",
    ]);
    expect(state.agents.impact.status).toBe("active");

    state = reduceWriterRoomEvents(state, await source.advance());

    expect(state.agents.impact.status).toBe("complete");
    expect(state.phase).toBe("report");
    expect(state.report?.assessment).toContain("recurring role");
  });

  it("returns from conversational clarification to the same investigation flow", async () => {
    const source = createDemoFixture({ clarificationFirst: true });
    let state = createInitialState();

    state = reduceWriterRoomEvents(
      state,
      await source.sendMessage("A character appears after a major event."),
    );

    expect(state.phase).toBe("conversation");
    expect(state.needsWriterInput).toBe(true);
    expect(state.messages.at(-1)?.text).toContain("what point in the MCU timeline");

    state = reduceWriterRoomEvents(
      state,
      await source.sendMessage("Immediately after the event."),
    );

    expect(state.phase).toBe("investigation");
    expect(state.needsWriterInput).toBe(false);
    expect(state.agents.timeline.activity).toBe("Checking chronology");
  });
});
