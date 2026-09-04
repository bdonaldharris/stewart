import { describe, expect, it, vi } from "vitest";

import type { WriterRoomEventBatch } from "../model/events";
import {
  BrowserSpeechQueue,
  selectStewartVoice,
  VoiceAnnouncementMapper,
} from "./browserVoice";

class MockUtterance {
  lang = "";
  voice: SpeechSynthesisVoice | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly text: string) {}
}

function voice(name: string, lang: string, isDefault = false): SpeechSynthesisVoice {
  return {
    default: isDefault,
    lang,
    localService: true,
    name,
    voiceURI: name,
  };
}

function createSpeechHarness(
  initialVoices: SpeechSynthesisVoice[] = [voice("Samantha", "en-US", true)],
) {
  let voices = initialVoices;
  const utterances: MockUtterance[] = [];
  const speak = vi.fn((utterance: MockUtterance) => utterances.push(utterance));
  const cancel = vi.fn();
  const getVoices = vi.fn(() => voices);
  const synthesis = Object.assign(new EventTarget(), {
    speak,
    cancel,
    getVoices,
  }) as unknown as SpeechSynthesis;

  return {
    synthesis,
    utterances,
    speak,
    cancel,
    setVoices(next: SpeechSynthesisVoice[]) {
      voices = next;
      synthesis.dispatchEvent(new Event("voiceschanged"));
    },
  };
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
      "I'm sending your proposal to the investigation team.",
      "Lore investigation complete.",
      "Timeline investigation complete.",
      "Relationship investigation complete.",
      "Impact investigation complete.",
      "The investigation is complete. I’ve prepared the Stewardship Report.",
    ]);
  });

  it("replaces a fixture coordination message with one deterministic start speech", () => {
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
      "I'm sending your proposal to the investigation team.",
    ]);
  });
});

describe("Stewart voice selection", () => {
  it("prefers a clear male English voice without letting an unwanted male voice outrank it", () => {
    const unwantedMaleVoice = voice("Albert", "en-US");
    const defaultVoice = voice("Samantha", "en-US", true);
    const maleVoice = voice("Daniel", "en-GB");

    expect(selectStewartVoice([unwantedMaleVoice, defaultVoice, maleVoice])).toBe(maleVoice);
  });

  it("falls back to an English voice when no preferred male voice is identifiable", () => {
    const defaultEnglishVoice = voice("Samantha", "en-US", true);

    expect(
      selectStewartVoice([voice("Amélie", "fr-CA"), defaultEnglishVoice]),
    ).toBe(defaultEnglishVoice);
  });

  it("falls back to the browser default when no English voice is available", () => {
    const harness = createSpeechHarness([voice("Amélie", "fr-CA", true)]);
    const queue = new BrowserSpeechQueue({
      synthesis: harness.synthesis,
      utterance: MockUtterance as unknown as typeof SpeechSynthesisUtterance,
      onSpeakingChange: vi.fn(),
    });

    queue.enqueue([{ id: "message", text: "A Stewart response." }]);

    expect(harness.utterances[0].voice).toBeNull();
  });

  it("refreshes the selected voice when browser voices arrive later", () => {
    const harness = createSpeechHarness([]);
    const queue = new BrowserSpeechQueue({
      synthesis: harness.synthesis,
      utterance: MockUtterance as unknown as typeof SpeechSynthesisUtterance,
      onSpeakingChange: vi.fn(),
    });
    const maleVoice = voice("Microsoft David", "en-US");

    queue.enqueue([{ id: "initial", text: "Initial response." }]);
    expect(harness.utterances[0].voice).toBeNull();
    harness.setVoices([voice("Samantha", "en-US", true), maleVoice]);
    queue.enqueue([{ id: "next", text: "Next response." }]);
    harness.utterances[0].onend?.();

    expect(harness.utterances[1].voice).toBe(maleVoice);
  });

  it("pins one voice across conversation, clarification, and lifecycle speech", () => {
    const maleVoice = voice("Google UK English Male", "en-GB");
    const harness = createSpeechHarness([maleVoice]);
    const queue = new BrowserSpeechQueue({
      synthesis: harness.synthesis,
      utterance: MockUtterance as unknown as typeof SpeechSynthesisUtterance,
      onSpeakingChange: vi.fn(),
    });
    const events: WriterRoomEventBatch = [
      {
        type: "stewart_message",
        message: {
          id: "conversation",
          speaker: "stewart",
          text: "I can help investigate that proposal.",
        },
      },
      {
        type: "stewart_message",
        message: {
          id: "clarification",
          speaker: "stewart",
          text: "Who is the falling out between?",
          needsWriterInput: true,
        },
      },
      {
        type: "specialist_completed",
        result: {
          agent: "lore",
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
        type: "stewart_message",
        message: {
          id: "final",
          speaker: "stewart",
          text: "The investigation is complete.",
        },
      },
    ];

    queue.enqueue(new VoiceAnnouncementMapper().map(events));
    expect(harness.utterances[0].voice).toBe(maleVoice);
    harness.setVoices([voice("Samantha", "en-US", true)]);
    harness.utterances[0].onend?.();
    harness.setVoices([voice("Karen", "en-AU", true)]);
    for (let index = 1; index < 4; index += 1) {
      expect(harness.utterances[index].voice).toBe(maleVoice);
      harness.utterances[index].onend?.();
    }
    expect(harness.utterances.every((utterance) => utterance.voice === maleVoice)).toBe(true);
    expect(harness.utterances.map((utterance) => utterance.text)).toEqual([
      "I can help investigate that proposal.",
      "Who is the falling out between?",
      "Lore investigation complete.",
      "Impact investigation complete.",
      "The investigation is complete.",
    ]);
  });

  it("falls back to the browser voice if a pinned voice later errors", () => {
    const maleVoice = voice("Daniel", "en-GB");
    const harness = createSpeechHarness([maleVoice]);
    const queue = new BrowserSpeechQueue({
      synthesis: harness.synthesis,
      utterance: MockUtterance as unknown as typeof SpeechSynthesisUtterance,
      onSpeakingChange: vi.fn(),
    });

    queue.enqueue([
      { id: "first", text: "First response." },
      { id: "second", text: "Second response." },
      { id: "third", text: "Third response." },
    ]);
    harness.utterances[0].onend?.();
    expect(harness.utterances[1].voice).toBe(maleVoice);
    harness.utterances[1].onerror?.();

    expect(harness.utterances[2].voice).toBeNull();
  });
});

describe("investigation-start speech timing", () => {
  it("starts Stewart's coordination message immediately without waiting for voices to load", () => {
    const harness = createSpeechHarness([]);
    const queue = new BrowserSpeechQueue({
      synthesis: harness.synthesis,
      utterance: MockUtterance as unknown as typeof SpeechSynthesisUtterance,
      onSpeakingChange: vi.fn(),
    });
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

    queue.enqueue(new VoiceAnnouncementMapper().map(events));

    expect(harness.speak).toHaveBeenCalledOnce();
    expect(harness.utterances.map((utterance) => utterance.text)).toEqual([
      "I'm sending your proposal to the investigation team.",
    ]);
  });

  it("lets microphone cancellation clear stale speech before coordination begins", () => {
    const harness = createSpeechHarness();
    const queue = new BrowserSpeechQueue({
      synthesis: harness.synthesis,
      utterance: MockUtterance as unknown as typeof SpeechSynthesisUtterance,
      onSpeakingChange: vi.fn(),
    });

    queue.enqueue([
      { id: "stale-current", text: "Stale current speech." },
      { id: "stale-pending", text: "Stale pending speech." },
    ]);
    queue.cancelAndClear();
    queue.enqueue([{ id: "coordination", text: "Investigation coordination begins." }]);
    harness.utterances[0].onend?.();

    expect(harness.cancel).toHaveBeenCalledOnce();
    expect(harness.utterances.map((utterance) => utterance.text)).toEqual([
      "Stale current speech.",
      "Investigation coordination begins.",
    ]);
  });
});

describe("browser speech queue", () => {
  it("keeps completion announcements FIFO after coordination and ignores duplicate ids", () => {
    const harness = createSpeechHarness();
    const speaking = vi.fn();
    const queue = new BrowserSpeechQueue({
      synthesis: harness.synthesis,
      utterance: MockUtterance as unknown as typeof SpeechSynthesisUtterance,
      onSpeakingChange: speaking,
    });

    queue.enqueue([
      { id: "coordination", text: "Investigation coordination begins." },
      { id: "lore", text: "Lore investigation complete." },
      { id: "timeline", text: "Timeline investigation complete." },
      { id: "timeline", text: "Timeline investigation complete." },
      { id: "impact", text: "Impact investigation complete." },
    ]);

    expect(harness.utterances.map((utterance) => utterance.text)).toEqual([
      "Investigation coordination begins.",
    ]);
    harness.utterances[0].onend?.();
    expect(harness.utterances.map((utterance) => utterance.text)).toEqual([
      "Investigation coordination begins.",
      "Lore investigation complete.",
    ]);
    harness.utterances[1].onerror?.();
    expect(harness.utterances.map((utterance) => utterance.text)).toEqual([
      "Investigation coordination begins.",
      "Lore investigation complete.",
      "Timeline investigation complete.",
    ]);
    harness.utterances[2].onend?.();
    expect(harness.utterances.map((utterance) => utterance.text)).toEqual([
      "Investigation coordination begins.",
      "Lore investigation complete.",
      "Timeline investigation complete.",
      "Impact investigation complete.",
    ]);
    harness.utterances[3].onend?.();
    expect(speaking).toHaveBeenLastCalledWith(false);
  });

  it("cancels current and queued speech", () => {
    const harness = createSpeechHarness();
    const queue = new BrowserSpeechQueue({
      synthesis: harness.synthesis,
      utterance: MockUtterance as unknown as typeof SpeechSynthesisUtterance,
      onSpeakingChange: vi.fn(),
    });

    queue.enqueue([
      { id: "one", text: "One" },
      { id: "two", text: "Two" },
    ]);
    queue.cancelAndClear();
    harness.utterances[0].onend?.();

    expect(harness.cancel).toHaveBeenCalledOnce();
    expect(harness.utterances.map((utterance) => utterance.text)).toEqual(["One"]);
  });
});
