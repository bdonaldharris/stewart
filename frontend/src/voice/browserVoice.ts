import type { AgentId, WriterRoomEventBatch } from "../model/events";

export type ConversationMode = "text" | "voice";
export type VoiceInteractionState = "ready" | "listening" | "processing" | "speaking" | "error";

export interface SpeechQueueItem {
  id: string;
  text: string;
}

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
    const investigationStartIndex = events.findIndex(
      (event) => event.type === "investigation_started",
    );
    const batchHasCoordinationMessage =
      investigationStartIndex >= 0 &&
      events.some(
        (event, index) => event.type === "stewart_message" && index < investigationStartIndex,
      );

    for (const event of events) {
      switch (event.type) {
        case "investigation_started":
          this.investigationCycle += 1;
          if (!batchHasCoordinationMessage) {
            items.push({
              id: `investigation-${this.investigationCycle}-started`,
              text: "I’m sending your proposal to the investigation team.",
            });
          }
          break;
        case "specialist_completed":
          items.push(this.completion(event.result.agent));
          break;
        case "impact_completed":
          items.push(this.completion("impact"));
          break;
        case "stewart_message":
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

interface SpeechQueueOptions {
  synthesis: SpeechSynthesis;
  utterance: typeof SpeechSynthesisUtterance;
  onSpeakingChange: (speaking: boolean) => void;
}

const MALE_ENGLISH_VOICE_NAME =
  /\b(male|alex|albert|aman|daniel|david|eddy|fred|george|guy|mark|ralph|reed|ryan)\b/i;
const VOICE_LOAD_WAIT_MS = 400;

function isEnglishVoice(voice: SpeechSynthesisVoice): boolean {
  return /^en(?:[-_]|$)/i.test(voice.lang);
}

export function selectStewartVoice(
  voices: SpeechSynthesisVoice[],
): SpeechSynthesisVoice | null {
  const englishVoices = voices.filter(isEnglishVoice);
  return (
    englishVoices.find((voice) => MALE_ENGLISH_VOICE_NAME.test(voice.name)) ??
    englishVoices.find((voice) => voice.default) ??
    englishVoices[0] ??
    null
  );
}

export class BrowserSpeechQueue {
  private readonly pending: SpeechQueueItem[] = [];
  private readonly seen = new Set<string>();
  private current?: SpeechQueueItem;
  private generation = 0;
  private selectedVoice: SpeechSynthesisVoice | null = null;
  private voicesAvailable = false;
  private voiceWaitExpired = false;
  private voiceWaitTimer?: ReturnType<typeof setTimeout>;
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
    this.generation += 1;
    this.pending.length = 0;
    this.current = undefined;
    if (this.voiceWaitTimer) clearTimeout(this.voiceWaitTimer);
    this.voiceWaitTimer = undefined;
    this.options.synthesis.cancel();
    this.options.onSpeakingChange(false);
  }

  dispose(): void {
    this.cancelAndClear();
    this.options.synthesis.removeEventListener("voiceschanged", this.handleVoicesChanged);
  }

  private advance(): void {
    if (this.current) return;
    if (this.pending.length > 0 && !this.voicesAvailable && !this.voiceWaitExpired) {
      if (!this.voiceWaitTimer) {
        this.voiceWaitTimer = setTimeout(() => {
          this.voiceWaitTimer = undefined;
          this.voiceWaitExpired = true;
          this.advance();
        }, VOICE_LOAD_WAIT_MS);
      }
      return;
    }
    const next = this.pending.shift();
    if (!next) {
      this.options.onSpeakingChange(false);
      return;
    }

    this.current = next;
    const generation = this.generation;
    const utterance = new this.options.utterance(next.text);
    utterance.lang = "en-US";
    utterance.voice = this.selectedVoice;
    utterance.onend = () => this.finish(generation);
    utterance.onerror = () => this.finish(generation);
    this.options.onSpeakingChange(true);
    this.options.synthesis.speak(utterance);
  }

  private finish(generation: number): void {
    if (generation !== this.generation) return;
    this.current = undefined;
    this.advance();
  }

  private refreshVoice(): void {
    const voices = this.options.synthesis.getVoices();
    this.selectedVoice = selectStewartVoice(voices);
    if (voices.length === 0) return;
    this.voicesAvailable = true;
    if (this.voiceWaitTimer) clearTimeout(this.voiceWaitTimer);
    this.voiceWaitTimer = undefined;
    this.advance();
  }
}
