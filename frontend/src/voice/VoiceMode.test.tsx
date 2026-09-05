import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../App";
import type { ConversationMessage, WriterRoomEventBatch } from "../model/events";
import type { WriterRoomEventSource } from "../services/eventSource";
import type {
  BrowserSpeechRecognitionErrorEvent,
  BrowserSpeechRecognitionEvent,
  HostedAudio,
} from "./browserVoice";

class MockRecognition extends EventTarget {
  static instances: MockRecognition[] = [];

  continuous = false;
  interimResults = false;
  lang = "";
  maxAlternatives = 1;
  onend: ((event: Event) => void) | null = null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null = null;
  onnomatch: ((event: Event) => void) | null = null;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null = null;
  onstart: ((event: Event) => void) | null = null;
  start = vi.fn(() => this.onstart?.(new Event("start")));
  stop = vi.fn();
  abort = vi.fn();

  constructor() {
    super();
    MockRecognition.instances.push(this);
  }

  result(transcript: string, isFinal: boolean) {
    const alternative = { transcript, confidence: 1 } as SpeechRecognitionAlternative;
    const result = Object.assign([alternative], {
      isFinal,
      item: (index: number) => [alternative][index],
    }) as unknown as SpeechRecognitionResult;
    const results = Object.assign([result], {
      item: (index: number) => [result][index],
    }) as unknown as SpeechRecognitionResultList;
    this.onresult?.({ resultIndex: 0, results } as BrowserSpeechRecognitionEvent);
  }

  end() {
    this.onend?.(new Event("end"));
  }
}

class MockUtterance {
  lang = "";
  voice: SpeechSynthesisVoice | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly text: string) {}
}

function message(id: string, speaker: "writer" | "stewart", text: string): ConversationMessage {
  return { id, speaker, text };
}

class RecordingSource implements WriterRoomEventSource {
  readonly mode = "backend" as const;
  readonly canAdvance = false;
  readonly sent: string[] = [];
  response?: (value: string) => WriterRoomEventBatch;

  async sendMessage(value: string, onEvents?: (events: WriterRoomEventBatch) => void) {
    this.sent.push(value);
    const events = this.response?.(value) ?? [
      { type: "writer_message" as const, message: message(`writer-${this.sent.length}`, "writer", value) },
    ];
    onEvents?.(events);
    return events;
  }

  async advance(): Promise<WriterRoomEventBatch> {
    return [];
  }
}

class StreamingSource implements WriterRoomEventSource {
  readonly mode = "backend" as const;
  readonly canAdvance = false;
  readonly sent: string[] = [];
  private listener?: (events: WriterRoomEventBatch) => void;
  private finishTurn?: (events: WriterRoomEventBatch) => void;

  sendMessage(value: string, onEvents?: (events: WriterRoomEventBatch) => void) {
    this.sent.push(value);
    this.listener = onEvents;
    onEvents?.([
      {
        type: "writer_message",
        message: message(`writer-${this.sent.length}`, "writer", value),
      },
    ]);
    return new Promise<WriterRoomEventBatch>((resolve) => {
      this.finishTurn = resolve;
    });
  }

  emit(events: WriterRoomEventBatch) {
    this.listener?.(events);
  }

  finish() {
    this.finishTurn?.([]);
  }

  async advance(): Promise<WriterRoomEventBatch> {
    return [];
  }
}

class HostedStreamingSource extends StreamingSource {
  readonly speechRequests: Array<{ text: string; signal?: AbortSignal }> = [];

  async getSpeechAudio(text: string, signal?: AbortSignal): Promise<Blob> {
    this.speechRequests.push({ text, signal });
    return new Blob(["mp3-audio"], { type: "audio/mpeg" });
  }
}

class FailingHostedStreamingSource extends StreamingSource {
  readonly getSpeechAudio = vi.fn(async () => {
    throw new Error("Hosted speech unavailable");
  });
}

class MockHostedAudio implements HostedAudio {
  onended: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  pause = vi.fn();
  play = vi.fn(async () => undefined);

  constructor(public src: string) {}
}

interface BrowserMocks {
  getUserMedia: ReturnType<typeof vi.fn>;
  speechSynthesis: {
    speak: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
    getVoices: ReturnType<typeof vi.fn>;
  };
  trackStop: ReturnType<typeof vi.fn>;
  analyserRead: ReturnType<typeof vi.fn>;
  hostedAudios: MockHostedAudio[];
  revokeObjectURL: ReturnType<typeof vi.fn>;
  utterances: MockUtterance[];
  runAnimationFrame(): void;
}

const originalDescriptors = {
  recognition: Object.getOwnPropertyDescriptor(window, "SpeechRecognition"),
  webkitRecognition: Object.getOwnPropertyDescriptor(window, "webkitSpeechRecognition"),
  audioContext: Object.getOwnPropertyDescriptor(window, "AudioContext"),
  audio: Object.getOwnPropertyDescriptor(window, "Audio"),
  utterance: Object.getOwnPropertyDescriptor(window, "SpeechSynthesisUtterance"),
  synthesis: Object.getOwnPropertyDescriptor(window, "speechSynthesis"),
  mediaDevices: Object.getOwnPropertyDescriptor(navigator, "mediaDevices"),
  requestAnimationFrame: Object.getOwnPropertyDescriptor(window, "requestAnimationFrame"),
  cancelAnimationFrame: Object.getOwnPropertyDescriptor(window, "cancelAnimationFrame"),
  createObjectURL: Object.getOwnPropertyDescriptor(URL, "createObjectURL"),
  revokeObjectURL: Object.getOwnPropertyDescriptor(URL, "revokeObjectURL"),
};

function restore(target: object, key: PropertyKey, descriptor?: PropertyDescriptor) {
  if (descriptor) Object.defineProperty(target, key, descriptor);
  else Reflect.deleteProperty(target, key);
}

function installBrowserMocks(options: { permissionDenied?: boolean } = {}): BrowserMocks {
  MockRecognition.instances = [];
  const trackStop = vi.fn();
  const stream = { getTracks: () => [{ stop: trackStop }] } as unknown as MediaStream;
  const getUserMedia = options.permissionDenied
    ? vi.fn().mockRejectedValue(new DOMException("Denied", "NotAllowedError"))
    : vi.fn().mockResolvedValue(stream);
  const analyserRead = vi.fn((data: Uint8Array) => data.fill(90));
  const analyser = {
    frequencyBinCount: 32,
    fftSize: 64,
    smoothingTimeConstant: 0,
    getByteFrequencyData: analyserRead,
  } as unknown as AnalyserNode;
  const source = { connect: vi.fn(), disconnect: vi.fn() } as unknown as MediaStreamAudioSourceNode;

  class MockAudioContext {
    state: AudioContextState = "running";
    createMediaStreamSource = vi.fn(() => source);
    createAnalyser = vi.fn(() => analyser);
    resume = vi.fn(async () => undefined);
    close = vi.fn(async () => {
      this.state = "closed";
    });
  }

  const utterances: MockUtterance[] = [];
  const defaultVoice = {
    default: true,
    lang: "en-US",
    localService: true,
    name: "Test English Voice",
    voiceURI: "test-english-voice",
  } as SpeechSynthesisVoice;
  const speechSynthesis = Object.assign(new EventTarget(), {
    speak: vi.fn((utterance: MockUtterance) => utterances.push(utterance)),
    cancel: vi.fn(),
    getVoices: vi.fn(() => [defaultVoice]),
  });
  const hostedAudios: MockHostedAudio[] = [];
  class MockAudio {
    constructor(source: string) {
      const audio = new MockHostedAudio(source);
      hostedAudios.push(audio);
      return audio;
    }
  }
  const createObjectURL = vi.fn(() => `blob:stewart-${hostedAudios.length + 1}`);
  const revokeObjectURL = vi.fn();
  let animationFrame: FrameRequestCallback | undefined;

  Object.defineProperty(window, "SpeechRecognition", {
    configurable: true,
    value: MockRecognition,
  });
  Object.defineProperty(window, "AudioContext", {
    configurable: true,
    value: MockAudioContext,
  });
  Object.defineProperty(window, "Audio", {
    configurable: true,
    value: MockAudio,
  });
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: createObjectURL,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: revokeObjectURL,
  });
  Object.defineProperty(window, "SpeechSynthesisUtterance", {
    configurable: true,
    value: MockUtterance,
  });
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: speechSynthesis,
  });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  Object.defineProperty(window, "requestAnimationFrame", {
    configurable: true,
    value: vi.fn((callback: FrameRequestCallback) => {
      animationFrame = callback;
      return 1;
    }),
  });
  Object.defineProperty(window, "cancelAnimationFrame", {
    configurable: true,
    value: vi.fn(),
  });

  return {
    getUserMedia,
    speechSynthesis,
    trackStop,
    analyserRead,
    hostedAudios,
    revokeObjectURL,
    utterances,
    runAnimationFrame: () => animationFrame?.(0),
  };
}

async function submitVoiceProposal(
  user: ReturnType<typeof userEvent.setup>,
  transcript: string,
) {
  await user.click(screen.getByRole("radio", { name: "Voice" }));
  await user.click(screen.getByRole("button", { name: "Start listening" }));
  const recognition = MockRecognition.instances.at(-1);
  if (!recognition) throw new Error("Recognition did not start");
  act(() => recognition.result(transcript, true));
  await user.click(screen.getByRole("button", { name: "Stop listening" }));
  act(() => recognition.end());
  await user.click(screen.getByRole("button", { name: "Send transcript to Stewart" }));
}

afterEach(() => {
  restore(window, "SpeechRecognition", originalDescriptors.recognition);
  restore(window, "webkitSpeechRecognition", originalDescriptors.webkitRecognition);
  restore(window, "AudioContext", originalDescriptors.audioContext);
  restore(window, "Audio", originalDescriptors.audio);
  restore(window, "SpeechSynthesisUtterance", originalDescriptors.utterance);
  restore(window, "speechSynthesis", originalDescriptors.synthesis);
  restore(navigator, "mediaDevices", originalDescriptors.mediaDevices);
  restore(window, "requestAnimationFrame", originalDescriptors.requestAnimationFrame);
  restore(window, "cancelAnimationFrame", originalDescriptors.cancelAnimationFrame);
  restore(URL, "createObjectURL", originalDescriptors.createObjectURL);
  restore(URL, "revokeObjectURL", originalDescriptors.revokeObjectURL);
});

describe("Writer's Room Voice Mode", () => {
  it("defaults to Voice when available without requesting microphone access and preserves the session across mode switches", async () => {
    const mocks = installBrowserMocks();
    const source = new RecordingSource();
    const user = userEvent.setup();
    render(<App eventSource={source} />);

    expect(screen.getByRole("radio", { name: "Voice" })).toHaveAttribute("aria-checked", "true");
    expect(mocks.getUserMedia).not.toHaveBeenCalled();
    expect(MockRecognition.instances).toHaveLength(0);
    await user.click(screen.getByRole("radio", { name: "Text" }));
    expect(screen.getByRole("radio", { name: "Text" })).toHaveAttribute("aria-checked", "true");
    await user.type(
      screen.getByPlaceholderText("Describe the story idea you want Stewart to investigate…"),
      "A continuing proposal",
    );
    await user.click(screen.getByRole("button", { name: "Send proposal to Stewart" }));

    expect(source.sent).toEqual(["A continuing proposal"]);
    expect(screen.getByText("A continuing proposal")).toBeInTheDocument();
  });

  it("captures real analyser data, previews final recognition, and requires explicit send", async () => {
    const mocks = installBrowserMocks();
    const source = new RecordingSource();
    const user = userEvent.setup();
    render(<App eventSource={source} />);

    expect(
      screen.getByText(/Writer speech recognition may use your browser vendor's speech service/),
    ).toBeInTheDocument();
    expect(screen.getByText(/spoken replies are generated by Google Cloud/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Start listening" }));

    expect(mocks.getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(screen.getByText("Listening")).toBeInTheDocument();
    mocks.runAnimationFrame();
    expect(mocks.analyserRead).toHaveBeenCalled();

    const recognition = MockRecognition.instances[0];
    act(() => recognition.result("A possible falling out", false));
    expect(screen.getByText("A possible falling out")).toHaveClass("voice-transcript-interim");
    expect(screen.getByRole("button", { name: "Send transcript to Stewart" })).toBeDisabled();
    expect(source.sent).toEqual([]);

    act(() => recognition.result("A falling out after Endgame", true));
    await user.click(screen.getByRole("button", { name: "Stop listening" }));
    act(() => recognition.end());
    expect(mocks.trackStop).toHaveBeenCalled();
    expect(screen.getByText("A falling out after Endgame")).toBeInTheDocument();
    expect(source.sent).toEqual([]);

    await user.click(screen.getByRole("button", { name: "Send transcript to Stewart" }));
    expect(source.sent).toEqual(["A falling out after Endgame"]);
    expect(screen.getByText("A falling out after Endgame")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Voice" })).toHaveAttribute("aria-checked", "true");
  });

  it("speaks only new Stewart and clarification messages after Voice Mode is active", async () => {
    const mocks = installBrowserMocks();
    const source = new RecordingSource();
    source.response = (value) => [
      { type: "writer_message", message: message(`writer-${source.sent.length}`, "writer", value) },
      {
        type: "stewart_message",
        message: {
          ...message(`stewart-${source.sent.length}`, "stewart", "Who is the falling out between?"),
          needsWriterInput: true,
        },
      },
    ];
    const user = userEvent.setup();
    render(<App eventSource={source} />);

    await user.click(screen.getByRole("radio", { name: "Text" }));
    const input = screen.getByPlaceholderText(
      "Describe the story idea you want Stewart to investigate…",
    );
    await user.type(input, "Old text proposal");
    await user.click(screen.getByRole("button", { name: "Send proposal to Stewart" }));
    expect(mocks.speechSynthesis.speak).not.toHaveBeenCalled();

    await user.click(screen.getByRole("radio", { name: "Voice" }));
    expect(mocks.speechSynthesis.speak).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Start listening" }));
    const recognition = MockRecognition.instances[0];
    act(() => recognition.result("It is between Carol and Monica", true));
    await user.click(screen.getByRole("button", { name: "Stop listening" }));
    act(() => recognition.end());
    await user.click(screen.getByRole("button", { name: "Send transcript to Stewart" }));

    expect(screen.getAllByText("Who is the falling out between?")).toHaveLength(2);
    const spoken = mocks.speechSynthesis.speak.mock.calls[0][0] as MockUtterance;
    expect(spoken.text).toBe("Who is the falling out between?");
  });

  it("cancels speech before microphone capture and when returning to Text", async () => {
    const mocks = installBrowserMocks();
    const source = new RecordingSource();
    source.response = (value) => [
      { type: "writer_message", message: message("writer-new", "writer", value) },
      {
        type: "stewart_message",
        message: message("stewart-new", "stewart", "A new Stewart response."),
      },
    ];
    const user = userEvent.setup();
    render(<App eventSource={source} />);

    await user.click(screen.getByRole("radio", { name: "Voice" }));
    await user.click(screen.getByRole("button", { name: "Start listening" }));
    expect(mocks.speechSynthesis.cancel).toHaveBeenCalledTimes(1);
    const recognition = MockRecognition.instances[0];
    act(() => recognition.result("A proposal", true));
    await user.click(screen.getByRole("button", { name: "Stop listening" }));
    act(() => recognition.end());
    await user.click(screen.getByRole("button", { name: "Send transcript to Stewart" }));
    expect(mocks.speechSynthesis.speak).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("radio", { name: "Text" }));
    expect(mocks.speechSynthesis.cancel).toHaveBeenCalledTimes(2);
    expect(screen.getByText("A new Stewart response.")).toBeInTheDocument();
  });

  it("keeps the initial page visible until deterministic coordination speech completes", async () => {
    const mocks = installBrowserMocks();
    const source = new StreamingSource();
    const user = userEvent.setup();
    render(<App eventSource={source} />);

    await submitVoiceProposal(user, "A proposal for the investigation");
    expect(source.sent).toEqual(["A proposal for the investigation"]);
    expect(
      screen.getByRole("heading", { name: "Bring the idea. Stewart will map what it touches." }),
    ).toBeInTheDocument();

    act(() =>
      source.emit([
        {
          type: "stewart_message",
          message: message(
            "coordination",
            "stewart",
            "I’m coordinating Lore, Timeline, and Relationship now.",
          ),
        },
        { type: "investigation_started" },
        {
          type: "specialist_status",
          agent: "lore",
          status: "active",
          activity: "Searching sources",
        },
      ]),
    );

    await waitFor(() => expect(mocks.speechSynthesis.speak).toHaveBeenCalledOnce());
    expect(mocks.utterances[0].text).toBe(
      "I'm sending your proposal to the investigation team.",
    );
    expect(
      screen.getByRole("heading", { name: "Bring the idea. Stewart will map what it touches." }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Specialist Workspace" }),
    ).not.toBeInTheDocument();

    act(() => mocks.utterances[0].onend?.());

    expect(screen.getByRole("heading", { name: "Specialist Workspace" })).toBeInTheDocument();
    expect(screen.getByTestId("agent-card-lore")).toHaveTextContent("Searching sources");
    expect(mocks.utterances).toHaveLength(1);
    act(() => source.finish());
  });

  it("waits for hosted coordination audio and cancels hosted playback on microphone start", async () => {
    const mocks = installBrowserMocks();
    const source = new HostedStreamingSource();
    const user = userEvent.setup();
    render(<App eventSource={source} />);

    await submitVoiceProposal(user, "A proposal for hosted speech");
    act(() =>
      source.emit([
        { type: "investigation_started" },
        {
          type: "specialist_status",
          agent: "lore",
          status: "active",
          activity: "Searching sources",
        },
      ]),
    );

    await waitFor(() => expect(source.speechRequests).toHaveLength(1));
    expect(source.speechRequests[0].text).toBe(
      "I'm sending your proposal to the investigation team.",
    );
    expect(mocks.speechSynthesis.speak).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "Bring the idea. Stewart will map what it touches." }),
    ).toBeInTheDocument();

    act(() => mocks.hostedAudios[0].onended?.(new Event("ended")));
    expect(screen.getByRole("heading", { name: "Specialist Workspace" })).toBeInTheDocument();
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith("blob:stewart-1");

    act(() =>
      source.emit([
        {
          type: "specialist_completed",
          result: {
            agent: "lore",
            summary: "Lore complete.",
            findings: [],
            sources: [],
            assumptions: [],
          },
        },
      ]),
    );
    await waitFor(() => expect(source.speechRequests).toHaveLength(2));
    await user.click(screen.getByRole("button", { name: "Start listening" }));

    expect(mocks.hostedAudios[1].pause).toHaveBeenCalledOnce();
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith("blob:stewart-2");
    expect(mocks.speechSynthesis.cancel).toHaveBeenCalled();
    act(() => source.finish());
  });

  it("releases hosted coordination and cancels playback when switching to Text", async () => {
    const mocks = installBrowserMocks();
    const source = new HostedStreamingSource();
    const user = userEvent.setup();
    render(<App eventSource={source} />);

    await submitVoiceProposal(user, "A hosted proposal cancelled into Text mode");
    act(() => source.emit([{ type: "investigation_started" }]));
    await waitFor(() => expect(mocks.hostedAudios).toHaveLength(1));

    await user.click(screen.getByRole("radio", { name: "Text" }));

    expect(mocks.hostedAudios[0].pause).toHaveBeenCalledOnce();
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith("blob:stewart-1");
    expect(screen.getByRole("heading", { name: "Specialist Workspace" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Text" })).toHaveAttribute("aria-checked", "true");
    act(() => source.finish());
  });

  it("releases hosted coordination through browser fallback when the request fails", async () => {
    const mocks = installBrowserMocks();
    const source = new FailingHostedStreamingSource();
    const user = userEvent.setup();
    render(<App eventSource={source} />);

    await submitVoiceProposal(user, "A proposal with hosted speech unavailable");
    act(() => source.emit([{ type: "investigation_started" }]));
    await waitFor(() => expect(mocks.utterances).toHaveLength(1));

    expect(source.getSpeechAudio).toHaveBeenCalledWith(
      "I'm sending your proposal to the investigation team.",
      expect.any(AbortSignal),
    );
    expect(
      screen.getByRole("heading", { name: "Bring the idea. Stewart will map what it touches." }),
    ).toBeInTheDocument();
    act(() => mocks.utterances[0].onend?.());

    expect(screen.getByRole("heading", { name: "Specialist Workspace" })).toBeInTheDocument();
    act(() => source.finish());
  });

  it("releases the initial transition when coordination speech errors", async () => {
    const mocks = installBrowserMocks();
    const source = new StreamingSource();
    const user = userEvent.setup();
    render(<App eventSource={source} />);

    await submitVoiceProposal(user, "A proposal with a speech failure");
    act(() => source.emit([{ type: "investigation_started" }]));
    await waitFor(() => expect(mocks.utterances).toHaveLength(1));

    act(() => mocks.utterances[0].onerror?.());

    expect(screen.getByRole("heading", { name: "Specialist Workspace" })).toBeInTheDocument();
    act(() => source.finish());
  });

  it("releases the initial transition and clears speech when switching to Text", async () => {
    const mocks = installBrowserMocks();
    const source = new StreamingSource();
    const user = userEvent.setup();
    render(<App eventSource={source} />);

    await submitVoiceProposal(user, "A proposal cancelled into Text mode");
    act(() => source.emit([{ type: "investigation_started" }]));
    await waitFor(() => expect(mocks.utterances).toHaveLength(1));

    await user.click(screen.getByRole("radio", { name: "Text" }));

    expect(mocks.speechSynthesis.cancel).toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Specialist Workspace" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Text" })).toHaveAttribute("aria-checked", "true");
    act(() => source.finish());
  });

  it("commits Impact completion before presenting and speaking final synthesis", async () => {
    const mocks = installBrowserMocks();
    const source = new StreamingSource();
    const user = userEvent.setup();
    render(<App eventSource={source} />);

    await submitVoiceProposal(user, "A proposal with meaningful impact");
    act(() =>
      source.emit([
        { type: "investigation_started" },
        {
          type: "specialist_status",
          agent: "impact",
          status: "active",
          activity: "Analyzing implications",
        },
      ]),
    );
    await waitFor(() => expect(mocks.utterances).toHaveLength(1));
    act(() => mocks.utterances[0].onend?.());
    expect(screen.getByTestId("agent-card-impact")).toHaveAttribute("data-status", "active");

    const finalMessage = "The investigation is complete. I’ve prepared the Stewardship Report.";
    act(() =>
      source.emit([
        {
          type: "stewart_message",
          message: message("final", "stewart", finalMessage),
        },
      ]),
    );
    expect(screen.queryByText(finalMessage)).not.toBeInTheDocument();
    expect(mocks.utterances).toHaveLength(1);

    act(() =>
      source.emit([
        {
          type: "impact_completed",
          result: {
            summary: "Impact is complete.",
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
            assessment: "A concise assessment.",
            continuityConsiderations: [],
            opportunities: [],
            audienceConsiderations: [],
            options: [],
          },
        },
      ]),
    );

    expect(await screen.findByText(finalMessage)).toBeInTheDocument();
    expect(screen.queryByTestId("agent-card-impact")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Stewardship Report" })).toBeInTheDocument();
    await waitFor(() => expect(mocks.utterances).toHaveLength(2));
    expect(mocks.utterances[1].text).toBe("Impact investigation complete.");

    act(() => mocks.utterances[1].onend?.());

    expect(mocks.utterances[2].text).toBe(finalMessage);
    act(() => source.finish());
  });

  it("keeps Text usable after permission denial", async () => {
    installBrowserMocks({ permissionDenied: true });
    const source = new RecordingSource();
    const user = userEvent.setup();
    render(<App eventSource={source} />);

    await user.click(screen.getByRole("radio", { name: "Voice" }));
    await user.click(screen.getByRole("button", { name: "Start listening" }));
    expect(await screen.findByText(/Microphone access was denied/)).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Text" }));
    const input = screen.getByPlaceholderText(
      "Describe the story idea you want Stewart to investigate…",
    );
    await user.type(input, "Typed fallback");
    await user.click(screen.getByRole("button", { name: "Send proposal to Stewart" }));

    expect(source.sent).toEqual(["Typed fallback"]);
  });

  it("does not submit an empty recognition result and keeps Text available", async () => {
    installBrowserMocks();
    const source = new RecordingSource();
    const user = userEvent.setup();
    render(<App eventSource={source} />);

    await user.click(screen.getByRole("radio", { name: "Voice" }));
    await user.click(screen.getByRole("button", { name: "Start listening" }));
    const recognition = MockRecognition.instances[0];
    await user.click(screen.getByRole("button", { name: "Stop listening" }));
    act(() => recognition.end());

    expect(screen.getByText(/No speech was recognized/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send transcript to Stewart" })).toBeDisabled();
    expect(source.sent).toEqual([]);

    await user.click(screen.getByRole("radio", { name: "Text" }));
    await user.type(
      screen.getByPlaceholderText("Describe the story idea you want Stewart to investigate…"),
      "Typed after no speech",
    );
    await user.click(screen.getByRole("button", { name: "Send proposal to Stewart" }));

    expect(source.sent).toEqual(["Typed after no speech"]);
  });

  it("disables Voice without browser support while Text remains usable", async () => {
    const source = new RecordingSource();
    const user = userEvent.setup();
    render(<App eventSource={source} />);

    expect(screen.getByRole("radio", { name: "Text" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Voice" })).toBeDisabled();
    expect(screen.getByText("Voice is unavailable in this browser.")).toBeInTheDocument();
    const input = screen.getByPlaceholderText(
      "Describe the story idea you want Stewart to investigate…",
    );
    await user.type(input, "Text still works");
    await user.click(screen.getByRole("button", { name: "Send proposal to Stewart" }));
    expect(source.sent).toEqual(["Text still works"]);
  });
});
