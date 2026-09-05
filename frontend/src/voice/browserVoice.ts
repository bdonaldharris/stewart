import type { AgentId, WriterRoomEventBatch } from "../model/events";

export type ConversationMode = "text" | "voice";
export type VoiceInteractionState = "ready" | "listening" | "processing" | "speaking" | "error";

export interface SpeechQueueItem {
  id: string;
  text: string;
  presentationBoundary?: "investigation-start" | "landing-welcome";
}

export type SpeechQueueSettlement = "completed" | "error" | "cancelled";

export const INVESTIGATION_COORDINATION_SPEECH =
  "I'm sending your proposal to the investigation team.";
export const LANDING_WELCOME_SPEECH = "Welcome to Stewart. What story are we protecting today?";
export const LANDING_WELCOME_SETTLEMENT_TIMEOUT_MS = 8_000;

export interface BrowserSpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

export interface BrowserSpeechRecognitionErrorEvent extends Event {
  readonly error: string;
}

export interface BrowserSpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onend: ((event: Event) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onnomatch: ((event: Event) => void) | null;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onstart: ((event: Event) => void) | null;
  abort(): void;
  start(): void;
  stop(): void;
}

export interface BrowserSpeechRecognitionConstructor {
  new (): BrowserSpeechRecognition;
}

interface BrowserWindow extends Window {
  AudioContext?: typeof AudioContext;
  SpeechRecognition?: BrowserSpeechRecognitionConstructor;
  SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance;
  webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  webkitAudioContext?: typeof AudioContext;
}

export interface VoiceCapabilities {
  available: boolean;
  recognition?: BrowserSpeechRecognitionConstructor;
  audioContext?: typeof AudioContext;
}

export function detectVoiceCapabilities(
  browserWindow: BrowserWindow = window,
  browserNavigator: Navigator = navigator,
): VoiceCapabilities {
  const recognition =
    browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition;
  const audioContext = browserWindow.AudioContext ?? browserWindow.webkitAudioContext;
  const available = Boolean(
    recognition &&
      audioContext &&
      browserWindow.speechSynthesis &&
      browserWindow.SpeechSynthesisUtterance &&
      browserNavigator.mediaDevices?.getUserMedia,
  );

  return { available, recognition, audioContext };
}

export class VoiceAnnouncementMapper {
  private investigationCycle = 0;

  map(events: WriterRoomEventBatch): SpeechQueueItem[] {
    const items: SpeechQueueItem[] = [];

    for (const event of events) {
      switch (event.type) {
        case "investigation_started":
          this.investigationCycle += 1;
          items.push({
            id: `investigation-${this.investigationCycle}-started`,
            text: INVESTIGATION_COORDINATION_SPEECH,
            presentationBoundary: "investigation-start",
          });
          break;
        case "specialist_completed":
          items.push(this.completion(event.result.agent));
          break;
        case "impact_completed":
          items.push(this.completion("impact"));
          break;
        case "stewart_message":
          if (isInvestigationCoordinationMessage(event.message.text)) break;
          items.push({
            id: `stewart-message-${event.message.id}`,
            text: event.message.text,
          });
          break;
        case "writer_message":
        case "specialist_status":
        case "report_ready":
          break;
      }
    }
    return items;
  }

  private completion(agent: AgentId): SpeechQueueItem {
    const label = agent === "impact" ? "Impact" : agent[0].toUpperCase() + agent.slice(1);
    return {
      id: `investigation-${this.investigationCycle}-${agent}-complete`,
      text: `${label} investigation complete.`,
    };
  }
}

function isInvestigationCoordinationMessage(text: string): boolean {
  const normalized = text.toLowerCase().replaceAll("’", "'");
  return [
    "i'm coordinating lore, timeline, and relationship",
    "i am coordinating lore, timeline, and relationship",
  ].some((coordinationLead) => normalized.startsWith(coordinationLead));
}

interface SpeechQueueOptions {
  synthesis: SpeechSynthesis;
  utterance: typeof SpeechSynthesisUtterance;
  hosted?: HostedSpeechOptions;
  onSpeakingChange: (speaking: boolean) => void;
  onItemSettled?: (item: SpeechQueueItem, settlement: SpeechQueueSettlement) => void;
}

export type HostedSpeechRequest = (text: string, signal: AbortSignal) => Promise<Blob>;

export interface HostedAudio {
  onended: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
  src: string;
  pause(): void;
  play(): Promise<void>;
}

interface HostedSpeechOptions {
  request: HostedSpeechRequest;
  createAudio: (source: string) => HostedAudio;
  createObjectURL: (audio: Blob) => string;
  revokeObjectURL: (source: string) => void;
}

const PREFERRED_CLEAR_MALE_VOICE_NAMES = [
  "daniel",
  "reed",
  "eddy",
  "aman",
  "rishi",
  "alex",
  "google uk english male",
  "microsoft david",
  "microsoft guy",
  "microsoft mark",
  "microsoft ryan",
];
const PREFERRED_CLEAR_ENGLISH_VOICE_NAMES = [
  "samantha",
  "google us english",
  "microsoft aria",
  "microsoft jenny",
  "karen",
  "moira",
  "tessa",
];
const UNSUITABLE_VOICE_NAMES = [
  "albert",
  "bad news",
  "bahh",
  "bells",
  "boing",
  "bubbles",
  "cellos",
  "fred",
  "good news",
  "jester",
  "junior",
  "organ",
  "ralph",
  "superstar",
  "trinoids",
  "whisper",
  "wobble",
  "zarvox",
];

function isEnglishVoice(voice: SpeechSynthesisVoice): boolean {
  return /^en(?:[-_]|$)/i.test(voice.lang);
}

function nameMatches(voice: SpeechSynthesisVoice, candidate: string): boolean {
  const normalizedName = normalizeVoiceName(voice.name);
  const normalizedCandidate = normalizeVoiceName(candidate);
  return ` ${normalizedName} `.includes(` ${normalizedCandidate} `);
}

function normalizeVoiceName(name: string): string {
  return name.toLowerCase().replaceAll(/[^a-z0-9]+/g, " ").trim();
}

function preferredVoice(
  voices: SpeechSynthesisVoice[],
  candidates: string[],
): SpeechSynthesisVoice | undefined {
  for (const candidate of candidates) {
    const match = voices.find((voice) => nameMatches(voice, candidate));
    if (match) return match;
  }
  return undefined;
}

function isSuitableVoice(voice: SpeechSynthesisVoice): boolean {
  return !UNSUITABLE_VOICE_NAMES.some((candidate) => nameMatches(voice, candidate));
}

export function selectStewartVoice(
  voices: SpeechSynthesisVoice[],
): SpeechSynthesisVoice | null {
  const englishVoices = voices.filter(isEnglishVoice).filter(isSuitableVoice);
  return (
    preferredVoice(englishVoices, PREFERRED_CLEAR_MALE_VOICE_NAMES) ??
    englishVoices.find((voice) => voice.default) ??
    preferredVoice(englishVoices, PREFERRED_CLEAR_ENGLISH_VOICE_NAMES) ??
    englishVoices[0] ??
    null
  );
}

export class BrowserSpeechQueue {
  private readonly pending: SpeechQueueItem[] = [];
  private readonly seen = new Set<string>();
  private current?: SpeechQueueItem;
  private currentAudio?: HostedAudio;
  private currentObjectUrl?: string;
  private currentRequest?: AbortController;
  private currentVoice: SpeechSynthesisVoice | null = null;
  private browserFallbackStarted = false;
  private generation = 0;
  private selectedVoice: SpeechSynthesisVoice | null = null;
  private pinnedVoice: SpeechSynthesisVoice | null = null;
  private voicePinned = false;
  private blockedForUserActivation = false;
  private landingWelcomeRetryAttempted = false;
  private landingWelcomeSettlementTimer?: ReturnType<typeof setTimeout>;
  private readonly handleVoicesChanged = () => this.refreshVoice();

  constructor(private readonly options: SpeechQueueOptions) {
    this.refreshVoice();
    this.options.synthesis.addEventListener("voiceschanged", this.handleVoicesChanged);
  }

  enqueue(items: SpeechQueueItem[]): void {
    for (const item of items) {
      if (!item.text.trim() || this.seen.has(item.id)) continue;
      this.seen.add(item.id);
      this.pending.push(item);
    }
    this.advance();
  }

  cancelAndClear(): void {
    this.clear(true);
  }

  resumeAfterUserActivation(): void {
    const welcome =
      this.current?.presentationBoundary === "landing-welcome"
        ? this.current
        : this.pending.find((item) => item.presentationBoundary === "landing-welcome");
    if (welcome) {
      this.landingWelcomeRetryAttempted = true;
      if (this.current === welcome) this.armLandingWelcomeSettlement(welcome, this.generation);
    }
    if (!this.blockedForUserActivation) return;
    this.blockedForUserActivation = false;
    this.advance();
  }

  dispose(): void {
    this.clear(false);
    this.options.synthesis.removeEventListener("voiceschanged", this.handleVoicesChanged);
  }

  private clear(notifySettlement: boolean): void {
    const cancelled = this.current ? [this.current, ...this.pending] : [...this.pending];
    this.generation += 1;
    this.pending.length = 0;
    this.blockedForUserActivation = false;
    this.landingWelcomeRetryAttempted = false;
    this.clearLandingWelcomeSettlementTimer();
    this.current = undefined;
    this.currentVoice = null;
    this.browserFallbackStarted = false;
    this.stopHostedPlayback();
    this.options.synthesis.cancel();
    this.options.onSpeakingChange(false);
    if (notifySettlement) {
      cancelled.forEach((item) => this.options.onItemSettled?.(item, "cancelled"));
    }
  }

  private advance(): void {
    if (this.current || this.blockedForUserActivation) return;
    const next = this.pending.shift();
    if (!next) {
      this.options.onSpeakingChange(false);
      return;
    }

    this.current = next;
    this.browserFallbackStarted = false;
    const generation = this.generation;
    if (
      next.presentationBoundary === "landing-welcome" &&
      this.landingWelcomeRetryAttempted
    ) {
      this.armLandingWelcomeSettlement(next, generation);
    }
    this.options.onSpeakingChange(true);
    if (this.options.hosted) {
      void this.playHosted(next, generation);
      return;
    }
    this.playBrowser(next, generation);
  }

  private async playHosted(item: SpeechQueueItem, generation: number): Promise<void> {
    const hosted = this.options.hosted;
    if (!hosted) {
      this.playBrowser(item, generation);
      return;
    }

    const request = new AbortController();
    this.currentRequest = request;
    try {
      const blob = await hosted.request(item.text, request.signal);
      if (generation !== this.generation || this.current !== item) return;
      this.currentRequest = undefined;
      const objectUrl = hosted.createObjectURL(blob);
      this.currentObjectUrl = objectUrl;
      const audio = hosted.createAudio(objectUrl);
      this.currentAudio = audio;
      audio.onended = () => {
        this.stopHostedPlayback();
        this.finish(generation, "completed");
      };
      audio.onerror = () => this.fallbackToBrowser(item, generation);
      await audio.play();
    } catch (error) {
      if (generation !== this.generation || this.current !== item) return;
      if (isAutoplayBlocked(error)) {
        if (
          item.presentationBoundary === "landing-welcome" &&
          this.landingWelcomeRetryAttempted
        ) {
          this.stopHostedPlayback();
          this.finish(generation, "cancelled");
          return;
        }
        this.current = undefined;
        this.stopHostedPlayback();
        this.pending.unshift(item);
        this.blockedForUserActivation = true;
        this.options.onSpeakingChange(false);
        return;
      }
      this.fallbackToBrowser(item, generation);
    }
  }

  private fallbackToBrowser(item: SpeechQueueItem, generation: number): void {
    if (generation !== this.generation || this.current !== item) return;
    if (this.browserFallbackStarted) return;
    this.browserFallbackStarted = true;
    this.stopHostedPlayback();
    this.playBrowser(item, generation);
  }

  private playBrowser(item: SpeechQueueItem, generation: number): void {
    try {
      if (!this.voicePinned) this.refreshVoice();
      const utterance = new this.options.utterance(item.text);
      this.currentVoice = this.voicePinned ? this.pinnedVoice : this.selectedVoice;
      utterance.lang = this.currentVoice?.lang || "en-US";
      utterance.voice = this.currentVoice;
      utterance.onend = () => this.finish(generation, "completed");
      utterance.onerror = () => this.finish(generation, "error");
      this.options.synthesis.speak(utterance);
    } catch {
      this.finish(generation, "error");
    }
  }

  private finish(generation: number, settlement: SpeechQueueSettlement): void {
    if (generation !== this.generation) return;
    const completedItem = this.current;
    const completedVoice = this.currentVoice;
    if (settlement === "completed" && !this.voicePinned && completedVoice) {
      this.pinnedVoice = completedVoice;
      this.voicePinned = true;
    } else if (
      settlement === "error" &&
      this.voicePinned &&
      completedVoice === this.pinnedVoice
    ) {
      this.pinnedVoice = null;
    }
    this.current = undefined;
    if (completedItem?.presentationBoundary === "landing-welcome") {
      this.landingWelcomeRetryAttempted = false;
      this.clearLandingWelcomeSettlementTimer();
    }
    this.currentVoice = null;
    this.browserFallbackStarted = false;
    if (completedItem) this.options.onItemSettled?.(completedItem, settlement);
    this.advance();
  }

  private armLandingWelcomeSettlement(item: SpeechQueueItem, generation: number): void {
    if (item.presentationBoundary !== "landing-welcome") return;
    this.clearLandingWelcomeSettlementTimer();
    this.landingWelcomeSettlementTimer = setTimeout(() => {
      if (generation !== this.generation || this.current !== item) return;
      this.stopHostedPlayback();
      this.options.synthesis.cancel();
      this.finish(generation, "error");
    }, LANDING_WELCOME_SETTLEMENT_TIMEOUT_MS);
  }

  private clearLandingWelcomeSettlementTimer(): void {
    if (this.landingWelcomeSettlementTimer === undefined) return;
    clearTimeout(this.landingWelcomeSettlementTimer);
    this.landingWelcomeSettlementTimer = undefined;
  }

  private stopHostedPlayback(): void {
    this.currentRequest?.abort();
    this.currentRequest = undefined;
    if (this.currentAudio) {
      this.currentAudio.onended = null;
      this.currentAudio.onerror = null;
      this.currentAudio.pause();
      this.currentAudio.src = "";
      this.currentAudio = undefined;
    }
    if (this.currentObjectUrl) {
      this.options.hosted?.revokeObjectURL(this.currentObjectUrl);
      this.currentObjectUrl = undefined;
    }
  }

  private refreshVoice(): void {
    if (this.voicePinned) return;
    const voices = this.options.synthesis.getVoices();
    this.selectedVoice = selectStewartVoice(voices);
  }
}

function isAutoplayBlocked(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    Reflect.get(error, "name") === "NotAllowedError"
  );
}
