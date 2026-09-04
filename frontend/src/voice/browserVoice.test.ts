import { describe, expect, it, vi } from "vitest";

import type { WriterRoomEventBatch } from "../model/events";
import { BrowserSpeechQueue, VoiceAnnouncementMapper } from "./browserVoice";

class MockUtterance {
  lang = "";
  voice: SpeechSynthesisVoice | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly text: string) {}
}

describe("voice announcement mapping", () => {
  it("maps lifecycle completions and Stewart messages without narrating report content", () => {
    const mapper = new VoiceAnnouncementMapper();
    const events: WriterRoomEventBatch = [
      { type: "investigation_started" },
      { type: "specialist_status", agent: "lore", status: "active", activity: "Searching" },
      { type: "specialist_status", agent: "lore", status: "active", activity: "Searching again" },
      {
        type: "specialist_completed",
        result: { agent: "lore", summary: "Private summary", findings: [], sources: [], assumptions: [] },
      },
      {
        type: "specialist_completed",
        result: {
          agent: "timeline",
          summary: "Private summary",
          findings: [],
          sources: [],
          assumptions: [],
        },
      },
      {
        type: "specialist_completed",
        result: {
          agent: "relationship",
          summary: "Private summary",
          findings: [],
          sources: [],
          assumptions: [],
        },
      },
      {
        type: "impact_completed",
        result: {
          summary: "Private impact",
          risks: [],
          opportunities: [],
          affectedAreas: [],
          futureImplications: [],
          audienceConsiderations: [],
          tradeoffs: [],
          assumptions: [],
        },
      },
      {
        type: "report_ready",
        report: {
          assessment: "Private report",
          continuityConsiderations: [],
          opportunities: [],
          audienceConsiderations: [],
          options: [],
        },
      },
      {
        type: "stewart_message",
        message: {
          id: "complete",
          speaker: "stewart",
          text: "The investigation is complete. I’ve prepared the Stewardship Report.",
        },
      },
    ];

    expect(mapper.map(events).map((item) => item.text)).toEqual([
      "I’m sending your proposal to the investigation team.",
      "Lore investigation complete.",
      "Timeline investigation complete.",
      "Relationship investigation complete.",
      "Impact investigation complete.",
      "The investigation is complete. I’ve prepared the Stewardship Report.",
    ]);
  });

  it("uses a fixture coordination message instead of duplicate start speech", () => {
    const events: WriterRoomEventBatch = [
      {
        type: "stewart_message",
        message: {
          id: "coordination",
          speaker: "stewart",
          text: "I’m coordinating Lore, Timeline, and Relationship now.",
        },
      },
      { type: "investigation_started" },
    ];

    expect(new VoiceAnnouncementMapper().map(events).map((item) => item.text)).toEqual([
      "I’m coordinating Lore, Timeline, and Relationship now.",
    ]);
  });
});

describe("browser speech queue", () => {
  it("speaks FIFO, advances on end and error, and ignores duplicate ids", () => {
    const utterances: MockUtterance[] = [];
    const synthesis = {
      speak: vi.fn((utterance: MockUtterance) => utterances.push(utterance)),
      cancel: vi.fn(),
      getVoices: vi.fn(() => []),
    } as unknown as SpeechSynthesis;
    const speaking = vi.fn();
    const queue = new BrowserSpeechQueue({
      synthesis,
      utterance: MockUtterance as unknown as typeof SpeechSynthesisUtterance,
      onSpeakingChange: speaking,
    });

    queue.enqueue([
      { id: "lore", text: "Lore investigation complete." },
      { id: "timeline", text: "Timeline investigation complete." },
      { id: "timeline", text: "Timeline investigation complete." },
      { id: "impact", text: "Impact investigation complete." },
    ]);

    expect(utterances.map((utterance) => utterance.text)).toEqual([
      "Lore investigation complete.",
    ]);
    utterances[0].onend?.();
    expect(utterances.map((utterance) => utterance.text)).toEqual([
      "Lore investigation complete.",
      "Timeline investigation complete.",
    ]);
    utterances[1].onerror?.();
    expect(utterances.map((utterance) => utterance.text)).toEqual([
      "Lore investigation complete.",
      "Timeline investigation complete.",
      "Impact investigation complete.",
    ]);
    utterances[2].onend?.();
    expect(speaking).toHaveBeenLastCalledWith(false);
  });

  it("cancels current and queued speech", () => {
    const utterances: MockUtterance[] = [];
    const synthesis = {
      speak: vi.fn((utterance: MockUtterance) => utterances.push(utterance)),
      cancel: vi.fn(),
      getVoices: vi.fn(() => []),
    } as unknown as SpeechSynthesis;
    const queue = new BrowserSpeechQueue({
      synthesis,
      utterance: MockUtterance as unknown as typeof SpeechSynthesisUtterance,
      onSpeakingChange: vi.fn(),
    });

    queue.enqueue([
      { id: "one", text: "One" },
      { id: "two", text: "Two" },
    ]);
    queue.cancelAndClear();
    utterances[0].onend?.();

    expect(synthesis.cancel).toHaveBeenCalledOnce();
    expect(utterances.map((utterance) => utterance.text)).toEqual(["One"]);
  });
});
