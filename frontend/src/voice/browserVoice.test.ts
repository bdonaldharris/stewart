import { describe, expect, it, vi } from "vitest";

import type { WriterRoomEventBatch } from "../model/events";
import {
  BrowserSpeechQueue,
  LANDING_WELCOME_SPEECH,
  selectStewartVoice,
  VoiceAnnouncementMapper,
  type HostedAudio,
  type HostedSpeechRequest,
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
    replaceVoices(next: SpeechSynthesisVoice[]) {
      voices = next;
    },
    setVoices(next: SpeechSynthesisVoice[]) {
      voices = next;
      synthesis.dispatchEvent(new Event("voiceschanged"));
    },
  };
}

class MockHostedAudio implements HostedAudio {
  onended: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  pause = vi.fn();
  play = vi.fn(async () => undefined);

  constructor(public src: string) {}
}

function createHostedHarness(
  request: HostedSpeechRequest = vi.fn(async () =>
    new Blob(["mp3-audio"], { type: "audio/mpeg" }),
  ),
) {
  const audios: MockHostedAudio[] = [];
  const createObjectURL = vi.fn(() => `blob:stewart-${audios.length + 1}`);
  const revokeObjectURL = vi.fn();
  const createAudio = vi.fn((source: string) => {
    const audio = new MockHostedAudio(source);
    audios.push(audio);
    return audio;
  });
  return {
    request,
    audios,
    createObjectURL,
    revokeObjectURL,
    createAudio,
    options: { request, createObjectURL, revokeObjectURL, createAudio },
  };
}

async function settlePromises() {
  await Promise.resolve();
  await Promise.resolve();
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
  it("matches clear male voices available in the local macOS catalog", () => {
    const defaultVoice = voice("Samantha", "en-US", true);
    const reedVoice = voice("Reed (English (US))", "en-US");
    const eddyVoice = voice("Eddy (English (UK))", "en-GB");

    expect(selectStewartVoice([defaultVoice, eddyVoice, reedVoice])).toBe(reedVoice);
  });

  it("prefers a clear male English voice without letting an unwanted male voice outrank it", () => {
    const unwantedMaleVoice = voice("Albert", "en-US");
    const defaultVoice = voice("Samantha", "en-US", true);
    const maleVoice = voice("Daniel", "en-GB");

    expect(selectStewartVoice([unwantedMaleVoice, defaultVoice, maleVoice])).toBe(maleVoice);
  });

  it("recognizes a preferred male candidate inside a browser-prefixed name", () => {
    const defaultVoice = voice("Samantha", "en-US", true);
    const maleVoice = voice("Google Daniel (English United Kingdom)", "en-GB");

    expect(selectStewartVoice([defaultVoice, maleVoice])).toBe(maleVoice);
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

  it("uses a male voice delivered by voiceschanged before the first utterance", () => {
    const harness = createSpeechHarness([]);
    const queue = new BrowserSpeechQueue({
      synthesis: harness.synthesis,
      utterance: MockUtterance as unknown as typeof SpeechSynthesisUtterance,
      onSpeakingChange: vi.fn(),
    });
    const maleVoice = voice("Daniel", "en-GB");

    harness.setVoices([voice("Samantha", "en-US", true), maleVoice]);
    queue.enqueue([{ id: "initial", text: "Initial response." }]);

    expect(harness.utterances[0].voice).toBe(maleVoice);
    expect(harness.utterances[0].lang).toBe("en-GB");
  });

  it("rechecks Chrome's voice list immediately before the first unpinned utterance", () => {
    const harness = createSpeechHarness([]);
    const queue = new BrowserSpeechQueue({
      synthesis: harness.synthesis,
      utterance: MockUtterance as unknown as typeof SpeechSynthesisUtterance,
      onSpeakingChange: vi.fn(),
    });
    const maleVoice = voice("Reed (English (US))", "en-US");

    harness.replaceVoices([voice("Samantha", "en-US", true), maleVoice]);
    queue.enqueue([{ id: "initial", text: "Initial response." }]);

    expect(harness.utterances[0].voice).toBe(maleVoice);
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
  it("keeps an autoplay-blocked landing welcome pending until a writer interaction resumes it", async () => {
    const browser = createSpeechHarness();
    const autoplayBlocked = Object.assign(new Error("User activation is required."), {
      name: "NotAllowedError",
    });
    const hosted = createHostedHarness();
    hosted.createAudio.mockImplementation((source) => {
      const audio = new MockHostedAudio(source);
      if (hosted.audios.length === 0) audio.play.mockRejectedValue(autoplayBlocked);
      hosted.audios.push(audio);
      return audio;
    });
    const settled = vi.fn();
    const queue = new BrowserSpeechQueue({
      synthesis: browser.synthesis,
      utterance: MockUtterance as unknown as typeof SpeechSynthesisUtterance,
      hosted: hosted.options,
      onSpeakingChange: vi.fn(),
      onItemSettled: settled,
    });

    queue.enqueue([
      {
        id: "landing-welcome",
        text: LANDING_WELCOME_SPEECH,
        presentationBoundary: "landing-welcome",
      },
    ]);
    await settlePromises();

    expect(settled).not.toHaveBeenCalled();
    expect(browser.speak).not.toHaveBeenCalled();

    queue.resumeAfterUserActivation();
    await settlePromises();

    expect(hosted.request).toHaveBeenCalledTimes(2);
    expect(hosted.audios).toHaveLength(2);
    hosted.audios[1].onended?.(new Event("ended"));
    expect(settled).toHaveBeenCalledWith(
      expect.objectContaining({ id: "landing-welcome", text: LANDING_WELCOME_SPEECH }),
      "completed",
    );
  });

  it("uses hosted audio as the primary FIFO playback path", async () => {
    const browser = createSpeechHarness();
    const hosted = createHostedHarness();
    const settled = vi.fn();
    const queue = new BrowserSpeechQueue({
      synthesis: browser.synthesis,
      utterance: MockUtterance as unknown as typeof SpeechSynthesisUtterance,
      hosted: hosted.options,
      onSpeakingChange: vi.fn(),
      onItemSettled: settled,
    });

    queue.enqueue([
      { id: "coordination", text: "I'm sending your proposal to the investigation team." },
      { id: "lore", text: "Lore investigation complete." },
    ]);
    await settlePromises();

    expect(hosted.request).toHaveBeenCalledTimes(1);
    expect(hosted.audios).toHaveLength(1);
    expect(browser.speak).not.toHaveBeenCalled();
    hosted.audios[0].onended?.(new Event("ended"));
    await settlePromises();

    expect(hosted.request).toHaveBeenCalledTimes(2);
    expect(hosted.audios).toHaveLength(2);
    expect(settled).toHaveBeenCalledWith(
      expect.objectContaining({ id: "coordination" }),
      "completed",
    );
    hosted.audios[1].onended?.(new Event("ended"));
    expect(hosted.revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  it("falls back to browser speech when hosted synthesis fails", async () => {
    const browser = createSpeechHarness();
    const hosted = createHostedHarness(vi.fn().mockRejectedValue(new Error("unavailable")));
    const queue = new BrowserSpeechQueue({
      synthesis: browser.synthesis,
      utterance: MockUtterance as unknown as typeof SpeechSynthesisUtterance,
      hosted: hosted.options,
      onSpeakingChange: vi.fn(),
    });

    queue.enqueue([{ id: "message", text: "A Stewart response." }]);
    await settlePromises();

    expect(browser.speak).toHaveBeenCalledOnce();
    expect(browser.utterances[0].text).toBe("A Stewart response.");
  });

  it("falls back after hosted playback errors and settles text-only if the browser fails", async () => {
    const browser = createSpeechHarness();
    const hosted = createHostedHarness();
    const settled = vi.fn();
    const queue = new BrowserSpeechQueue({
      synthesis: browser.synthesis,
      utterance: MockUtterance as unknown as typeof SpeechSynthesisUtterance,
      hosted: hosted.options,
      onSpeakingChange: vi.fn(),
      onItemSettled: settled,
    });

    queue.enqueue([{ id: "message", text: "A Stewart response." }]);
    await settlePromises();
    hosted.audios[0].onerror?.(new Event("error"));

    expect(browser.speak).toHaveBeenCalledOnce();
    browser.utterances[0].onerror?.();
    expect(settled).toHaveBeenCalledWith(
      expect.objectContaining({ id: "message" }),
      "error",
    );
    expect(hosted.revokeObjectURL).toHaveBeenCalledWith("blob:stewart-1");
  });

  it("aborts an in-flight hosted request when cancelled", async () => {
    const browser = createSpeechHarness();
    let requestSignal: AbortSignal | undefined;
    const request = vi.fn((_text: string, signal: AbortSignal) => {
      requestSignal = signal;
      return new Promise<Blob>(() => undefined);
    });
    const hosted = createHostedHarness(request);
    const queue = new BrowserSpeechQueue({
      synthesis: browser.synthesis,
      utterance: MockUtterance as unknown as typeof SpeechSynthesisUtterance,
      hosted: hosted.options,
      onSpeakingChange: vi.fn(),
    });

    queue.enqueue([{ id: "message", text: "A Stewart response." }]);
    queue.cancelAndClear();

    expect(requestSignal?.aborted).toBe(true);
    expect(hosted.audios).toHaveLength(0);
    expect(browser.cancel).toHaveBeenCalledOnce();
  });

  it("cancels hosted playback and revokes its object URL", async () => {
    const browser = createSpeechHarness();
    const hosted = createHostedHarness();
    const queue = new BrowserSpeechQueue({
      synthesis: browser.synthesis,
      utterance: MockUtterance as unknown as typeof SpeechSynthesisUtterance,
      hosted: hosted.options,
      onSpeakingChange: vi.fn(),
    });

    queue.enqueue([{ id: "message", text: "A Stewart response." }]);
    await settlePromises();
    queue.cancelAndClear();

    expect(hosted.audios[0].pause).toHaveBeenCalledOnce();
    expect(hosted.revokeObjectURL).toHaveBeenCalledWith("blob:stewart-1");
    expect(browser.cancel).toHaveBeenCalledOnce();
  });

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
