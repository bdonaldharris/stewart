import type { AgentId, WriterRoomEventBatch } from "../model/events";

export type ConversationMode = "text" | "voice";
export type VoiceInteractionState = "ready" | "listening" | "processing" | "speaking" | "error";

export interface SpeechQueueItem {
  id: string;
  text: string;
  presentationBoundary?: "investigation-start";
}

export type SpeechQueueSettlement = "completed" | "error" | "cancelled";

export const INVESTIGATION_COORDINATION_SPEECH =
  "I'm sending your proposal to the investigation team.";

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
  onSpeakingChange: (speaking: boolean) => void;
  onItemSettled?: (item: SpeechQueueItem, settlement: SpeechQueueSettlement) => void;
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
  private currentVoice: SpeechSynthesisVoice | null = null;
  private generation = 0;
  private selectedVoice: SpeechSynthesisVoice | null = null;
  private pinnedVoice: SpeechSynthesisVoice | null = null;
  private voicePinned = false;
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

  dispose(): void {
    this.clear(false);
    this.options.synthesis.removeEventListener("voiceschanged", this.handleVoicesChanged);
  }

  private clear(notifySettlement: boolean): void {
    const cancelled = this.current ? [this.current, ...this.pending] : [...this.pending];
    this.generation += 1;
    this.pending.length = 0;
    this.current = undefined;
    this.currentVoice = null;
    this.options.synthesis.cancel();
    this.options.onSpeakingChange(false);
    if (notifySettlement) {
      cancelled.forEach((item) => this.options.onItemSettled?.(item, "cancelled"));
    }
  }

  private advance(): void {
    if (this.current) return;
    const next = this.pending.shift();
    if (!next) {
      this.options.onSpeakingChange(false);
      return;
    }

    this.current = next;
    const generation = this.generation;
    try {
      if (!this.voicePinned) this.refreshVoice();
      const utterance = new this.options.utterance(next.text);
      this.currentVoice = this.voicePinned ? this.pinnedVoice : this.selectedVoice;
      utterance.lang = this.currentVoice?.lang || "en-US";
      utterance.voice = this.currentVoice;
      utterance.onend = () => this.finish(generation, "completed");
      utterance.onerror = () => this.finish(generation, "error");
      this.options.onSpeakingChange(true);
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
    this.currentVoice = null;
    if (completedItem) this.options.onItemSettled?.(completedItem, settlement);
    this.advance();
  }

  private refreshVoice(): void {
    if (this.voicePinned) return;
    const voices = this.options.synthesis.getVoices();
    this.selectedVoice = selectStewartVoice(voices);
  }
}
