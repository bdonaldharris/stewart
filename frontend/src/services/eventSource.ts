import { createDemoFixture } from "../fixtures/demoFixture";
import type { WriterRoomEventBatch } from "../model/events";

export interface WriterRoomEventSource {
  readonly mode: "fixture" | "backend";
  readonly canAdvance: boolean;
  sendMessage(message: string): Promise<WriterRoomEventBatch>;
  advance(): Promise<WriterRoomEventBatch>;
}

class UnavailableBackendEventSource implements WriterRoomEventSource {
  readonly mode = "backend" as const;
  readonly canAdvance = false;

  async sendMessage(): Promise<WriterRoomEventBatch> {
    throw new Error(
      "The live browser adapter is not configured yet. Enable the development fixture or connect the Stewart event transport.",
    );
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
    : new UnavailableBackendEventSource();
}
