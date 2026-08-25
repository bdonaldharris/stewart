import { useState } from "react";

import { CompletedInvestigations } from "./components/CompletedInvestigations";
import { ConversationPanel, PromptComposer } from "./components/ConversationPanel";
import { Header } from "./components/Header";
import { InvestigationWorkspace } from "./components/InvestigationWorkspace";
import { StewardshipReport } from "./components/StewardshipReport";
import { createInitialState, reduceWriterRoomEvents } from "./model/state";
import {
  createConfiguredEventSource,
  type WriterRoomEventSource,
} from "./services/eventSource";

interface AppProps {
  eventSource?: WriterRoomEventSource;
}

export function App({ eventSource }: AppProps) {
  const [state, setState] = useState(createInitialState);
  const [source, setSource] = useState<WriterRoomEventSource>(
    () => eventSource ?? createConfiguredEventSource(),
  );
  const [clarificationDemo, setClarificationDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const fixtureMode = source.mode === "fixture";

  async function sendMessage(message: string) {
    setBusy(true);
    setError(undefined);
    try {
      const events = await source.sendMessage(message);
      setState((current) => reduceWriterRoomEvents(current, events));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Stewart could not process the message.");
    } finally {
      setBusy(false);
    }
  }

  async function advanceFixture() {
    setBusy(true);
    try {
      const events = await source.advance();
      setState((current) => reduceWriterRoomEvents(current, events));
    } finally {
      setBusy(false);
    }
  }

  function changeClarificationDemo(enabled: boolean) {
    setClarificationDemo(enabled);
    if (!eventSource) setSource(createConfiguredEventSource(enabled));
  }

  return (
    <div className="min-h-screen text-slate-100">
      <Header fixtureMode={fixtureMode} />
      {error && (
        <div className="mx-auto mt-2 max-w-3xl px-5 sm:px-8">
          <div className="rounded-xl border border-rose-300/20 bg-rose-300/5 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        </div>
      )}

      {state.phase === "entry" ? (
        <main className="entry-stage mx-auto flex w-full max-w-5xl flex-col items-center px-5 text-center sm:px-8">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-[#d4b47b]/20 bg-[#d4b47b]/5 px-3 py-1.5 text-[0.68rem] font-semibold tracking-[0.16em] text-[#d4b47b] uppercase">
            <span className="h-1 w-1 rounded-full bg-[#d4b47b]" />
            Writer&apos;s Room
          </div>
          <h1 className="max-w-4xl text-4xl leading-[1.08] font-medium tracking-[-0.035em] text-white sm:text-5xl lg:text-6xl">
            Bring the idea. Stewart will map what it touches.
          </h1>
          <p className="mt-6 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">
            Describe a creative proposal in your own words. Stewart will coordinate continuity
            discovery, implications, and informed paths forward.
          </p>
          <div className="mt-10 w-full max-w-3xl text-left">
            <PromptComposer onSubmit={sendMessage} disabled={busy} initial />
            {fixtureMode && !eventSource && (
              <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 text-xs text-slate-500">
                <input
                  type="checkbox"
                  checked={clarificationDemo}
                  onChange={(event) => changeClarificationDemo(event.target.checked)}
                  className="accent-[#d4b47b]"
                />
                Begin with a Stewart clarification question
              </label>
            )}
          </div>
          {fixtureMode && (
            <div className="fixture-notice mt-8">
              Development fixture · representative transitions · not live agent output
            </div>
          )}
        </main>
      ) : (
        <main className="mx-auto w-full max-w-[1480px] px-5 pt-4 pb-20 sm:px-8 lg:px-12">
          {fixtureMode && (
            <div className="fixture-bar mb-5">
              <div>
                <p className="text-xs font-medium text-amber-100/80">Development fixture</p>
                <p className="mt-1 text-[0.68rem] text-slate-500">
                  Representative event data using the intended backend contract—not live discovery.
                </p>
              </div>
              {source.canAdvance && (
                <button
                  type="button"
                  onClick={advanceFixture}
                  disabled={busy}
                  className="fixture-advance"
                >
                  Advance fixture
                  <span aria-hidden="true">→</span>
                </button>
              )}
            </div>
          )}

          <div className="workspace-layout">
            <aside className="space-y-6">
              <ConversationPanel
                messages={state.messages}
                needsWriterInput={state.needsWriterInput}
                onSubmit={sendMessage}
                busy={busy}
              />
              <CompletedInvestigations results={state.completedInvestigations} />
            </aside>

            <div className="min-w-0">
              {state.phase === "conversation" ? (
                <section className="panel flex min-h-[420px] items-center justify-center rounded-2xl p-8 text-center">
                  <div className="max-w-md">
                    <div className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-[#d4b47b]/20 bg-[#d4b47b]/5 text-[#d4b47b]">
                      S
                    </div>
                    <p className="eyebrow mt-6">Clarification</p>
                    <h2 className="mt-3 text-2xl font-medium text-slate-100">
                      Stewart is refining the investigation.
                    </h2>
                    <p className="mt-4 text-sm leading-7 text-slate-500">
                      Answer in the conversation. Specialist activity will appear here when the
                      investigation begins.
                    </p>
                  </div>
                </section>
              ) : state.report ? (
                <>
                  <StewardshipReport
                    report={state.report}
                    impact={state.impact}
                    fixtureMode={fixtureMode}
                  />
                  <InvestigationWorkspace state={state} secondary />
                </>
              ) : (
                <InvestigationWorkspace state={state} />
              )}
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
