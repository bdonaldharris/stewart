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

  it("requests hosted Stewart audio in the same browser conversation", async () => {
    const audio = new Uint8Array([1, 2, 3]);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ conversationId: "conversation-speech" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(audio, {
          status: 200,
          headers: { "Content-Type": "audio/mpeg" },
        }),
      )
      .mockResolvedValueOnce(streamResponse([]));
    vi.stubGlobal("fetch", fetchMock);
    const source = new BackendEventSource();

    const result = await source.getSpeechAudio("Lore investigation complete.");
    await source.sendMessage("Continue the proposal");

    expect(result.size).toBeGreaterThan(0);
    expect(fetchMock.mock.calls[1][0]).toBe(
      "/api/conversations/conversation-speech/speech",
    );
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ text: "Lore investigation complete." }),
    });
    expect(fetchMock.mock.calls[2][0]).toBe(
      "/api/conversations/conversation-speech/messages",
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("reuses the landing welcome conversation for the writer's first submission", async () => {
    const audio = new Uint8Array([1, 2, 3]);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ conversationId: "conversation-welcome" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(audio, { status: 200, headers: { "Content-Type": "audio/mpeg" } }),
      )
      .mockResolvedValueOnce(streamResponse([]));
    vi.stubGlobal("fetch", fetchMock);
    const source = new BackendEventSource();

    await source.getSpeechAudio("Welcome to Stewart. What story are we protecting today?");
    await source.sendMessage("A writer proposal");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe(
      "/api/conversations/conversation-welcome/speech",
    );
    expect(fetchMock.mock.calls[2][0]).toBe(
      "/api/conversations/conversation-welcome/messages",
    );
  });

  it("shares conversation creation when an aborted welcome attempt is replayed", async () => {
    let resolveConversation: (response: Response) => void;
    const conversation = new Promise<Response>((resolve) => {
      resolveConversation = resolve;
    });
    const audio = new Uint8Array([1, 2, 3]);
    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      if (input === "/api/conversations") return conversation;
      if (init?.signal?.aborted) {
        return Promise.reject(new DOMException("The operation was aborted.", "AbortError"));
      }
      return Promise.resolve(
        new Response(audio, { status: 200, headers: { "Content-Type": "audio/mpeg" } }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const source = new BackendEventSource();
    const firstAttempt = new AbortController();
    const abandoned = source.getSpeechAudio("Welcome to Stewart. What story are we protecting today?", firstAttempt.signal);
    const replayed = source.getSpeechAudio("Welcome to Stewart. What story are we protecting today?");

    firstAttempt.abort();
    resolveConversation!(
      new Response(JSON.stringify({ conversationId: "conversation-strict-mode" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(abandoned).rejects.toThrow("local browser transport is unavailable");
    expect((await replayed).size).toBeGreaterThan(0);
    expect(fetchMock.mock.calls.filter(([input]) => input === "/api/conversations")).toHaveLength(1);
    expect(fetchMock.mock.calls).toHaveLength(3);
  });

  it("rejects unusable hosted audio so the voice queue can fall back", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ conversationId: "conversation-speech" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response("not audio", {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      new BackendEventSource().getSpeechAudio("Impact investigation complete."),
    ).rejects.toThrow("unusable audio");
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
