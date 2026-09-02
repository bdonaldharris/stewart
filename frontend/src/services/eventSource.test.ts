import { afterEach, describe, expect, it, vi } from "vitest";

import { BackendEventSource, createConfiguredEventSource } from "./eventSource";

function streamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
        controller.close();
      },
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/x-ndjson" },
    },
  );
}

describe("Writer's Room event sources", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("streams backend events and reuses one browser conversation", async () => {
    const firstTurn = [
      '{"type":"writer_message","message":{"id":"writer-1","speaker":"writer",',
      '"text":"A proposal"}}\n',
      '{"type":"investigation_started"}\n',
      '{"type":"specialist_status","agent":"lore","status":"active","activity":"Reviewing lore"}\n',
    ];
    const secondTurn = [
      '{"type":"writer_message","message":{"id":"writer-2","speaker":"writer","text":"After Endgame"}}\n',
      '{"type":"stewart_message","message":{"id":"stewart-1","speaker":"stewart","text":"Continuing.","needsWriterInput":false}}\n',
    ];
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ conversationId: "conversation-1" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(streamResponse(firstTurn))
      .mockResolvedValueOnce(streamResponse(secondTurn));
    vi.stubGlobal("fetch", fetchMock);
    const source = new BackendEventSource();
    const firstEvents: string[] = [];
    const secondEvents: string[] = [];

    await source.sendMessage("A proposal", (events) => firstEvents.push(events[0].type));
    await source.sendMessage("After Endgame", (events) => secondEvents.push(events[0].type));

    expect(firstEvents).toEqual([
      "writer_message",
      "investigation_started",
      "specialist_status",
    ]);
    expect(secondEvents).toEqual(["writer_message", "stewart_message"]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/conversations");
    expect(fetchMock.mock.calls[1][0]).toBe(
      "/api/conversations/conversation-1/messages",
    );
    expect(fetchMock.mock.calls[2][0]).toBe(
      "/api/conversations/conversation-1/messages",
    );
  });

  it("surfaces the backend's safe streamed error", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ conversationId: "conversation-2" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        streamResponse([
          '{"type":"writer_message","message":{"id":"writer-1","speaker":"writer","text":"A proposal"}}\n',
          '{"error":{"message":"Stewart could not complete this turn."}}\n',
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);
    const emitted: string[] = [];

    await expect(
      new BackendEventSource().sendMessage("A proposal", (events) =>
        emitted.push(events[0].type),
      ),
    ).rejects.toThrow("Stewart could not complete this turn.");
    expect(emitted).toEqual(["writer_message"]);
  });

  it("reports an unavailable local transport without exposing fetch internals", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new Error("ECONNREFUSED")));

    await expect(new BackendEventSource().sendMessage("A proposal")).rejects.toThrow(
      "Stewart's local browser transport is unavailable",
    );
  });

  it("keeps fixture mode available", () => {
    vi.stubEnv("VITE_STEWART_DEMO_FIXTURE", "true");

    expect(createConfiguredEventSource().mode).toBe("fixture");
  });
});
