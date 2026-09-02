import { createDemoFixture } from "../fixtures/demoFixture";
import type { WriterRoomEvent, WriterRoomEventBatch } from "../model/events";

export type WriterRoomEventListener = (events: WriterRoomEventBatch) => void;

export interface WriterRoomEventSource {
  readonly mode: "fixture" | "backend";
  readonly canAdvance: boolean;
  sendMessage(
    message: string,
    onEvents?: WriterRoomEventListener,
  ): Promise<WriterRoomEventBatch>;
  advance(): Promise<WriterRoomEventBatch>;
}

const eventTypes = new Set<WriterRoomEvent["type"]>([
  "writer_message",
  "stewart_message",
  "investigation_started",
  "specialist_status",
  "specialist_completed",
  "impact_completed",
  "report_ready",
]);

function isWriterRoomEvent(value: unknown): value is WriterRoomEvent {
  if (!value || typeof value !== "object") return false;
  const eventType = Reflect.get(value, "type");
  return typeof eventType === "string" && eventTypes.has(eventType as WriterRoomEvent["type"]);
}

async function responseError(response: Response): Promise<Error> {
  try {
    const payload = (await response.json()) as { message?: unknown; detail?: unknown };
    const message = typeof payload.message === "string" ? payload.message : payload.detail;
    if (typeof message === "string" && message.trim()) return new Error(message);
  } catch {
    // Fall through to the stable browser-facing error.
  }
  return new Error("Stewart's local browser transport could not process the request.");
}

async function transportFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch {
    throw new Error(
      "Stewart's local browser transport is unavailable. Start the Python transport and try again.",
    );
  }
}

export class BackendEventSource implements WriterRoomEventSource {
  readonly mode = "backend" as const;
  readonly canAdvance = false;
  private conversationId?: string;

  private async ensureConversation(): Promise<string> {
    if (this.conversationId) return this.conversationId;
    const response = await transportFetch("/api/conversations", { method: "POST" });
    if (!response.ok) throw await responseError(response);
    const payload = (await response.json()) as { conversationId?: unknown };
    if (typeof payload.conversationId !== "string" || !payload.conversationId) {
      throw new Error("Stewart's local browser transport returned an invalid session.");
    }
    this.conversationId = payload.conversationId;
    return this.conversationId;
  }

  async sendMessage(
    message: string,
    onEvents?: WriterRoomEventListener,
  ): Promise<WriterRoomEventBatch> {
    const conversationId = await this.ensureConversation();
    const response = await transportFetch(`/api/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    if (!response.ok) throw await responseError(response);
    if (!response.body) {
      throw new Error("Stewart's local browser transport returned no event stream.");
    }

    const collected: WriterRoomEventBatch = [];
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const processLine = (line: string) => {
      if (!line.trim()) return;
      let payload: unknown;
      try {
        payload = JSON.parse(line);
      } catch {
        throw new Error("Stewart's local browser transport returned an invalid event.");
      }
      if (payload && typeof payload === "object" && "error" in payload) {
        const error = Reflect.get(payload, "error");
        const message = error && typeof error === "object" ? Reflect.get(error, "message") : null;
        throw new Error(
          typeof message === "string" && message.trim()
            ? message
            : "Stewart could not complete this turn.",
        );
      }
      if (!isWriterRoomEvent(payload)) {
        throw new Error("Stewart's local browser transport returned an invalid event.");
      }
      collected.push(payload);
      onEvents?.([payload]);
    };

    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      lines.forEach(processLine);
      if (done) break;
    }
    processLine(buffer);
    return collected;
  }

  async advance(): Promise<WriterRoomEventBatch> {
    return [];
  }
}

export function createConfiguredEventSource(
  clarificationDemo = false,
): WriterRoomEventSource {
  const fixtureEnabled = import.meta.env.VITE_STEWART_DEMO_FIXTURE !== "false";
  return fixtureEnabled
    ? createDemoFixture({ clarificationFirst: clarificationDemo })
    : new BackendEventSource();
}
