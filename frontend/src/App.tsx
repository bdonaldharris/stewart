import { useState } from "react";

import { ConversationPanel, PromptComposer } from "./components/ConversationPanel";
import { Header } from "./components/Header";
import { InvestigationWorkspace } from "./components/InvestigationWorkspace";
import { ReturnedInvestigations } from "./components/ReturnedInvestigations";
import { StewardshipReport } from "./components/StewardshipReport";
import { agentIds } from "./model/events";
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
  const specialistsInWorkspace = agentIds.some((agent) => {
    const status = state.agents[agent].status;
    return status !== "complete" && status !== "idle";
  });

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
    <div className="app-shell">
      <Header fixtureMode={fixtureMode} />
      {error && (
        <div className="error-wrap">
          <div className="error-banner">
            {error}
          </div>
        </div>
      )}

      {state.phase === "entry" ? (
        <main className="entry-stage">
          <div className="entry-kicker">
            <span aria-hidden="true" />
            Writer&apos;s Room
          </div>
          <h1>
            Bring the idea. Stewart will map what it touches.
          </h1>
          <p className="entry-copy">
            Describe a creative proposal in your own words. Stewart will coordinate continuity
            discovery, implications, and informed paths forward.
          </p>
          <div className="entry-composer">
            <PromptComposer onSubmit={sendMessage} disabled={busy} initial />
            {fixtureMode && !eventSource && (
              <label className="clarification-toggle">
                <input
                  type="checkbox"
                  checked={clarificationDemo}
                  onChange={(event) => changeClarificationDemo(event.target.checked)}
                />
                Begin with a Stewart clarification question
              </label>
            )}
          </div>
          {fixtureMode && (
            <div className="fixture-notice entry-fixture-notice">
              Development fixture · representative transitions · not live agent output
            </div>
          )}
        </main>
      ) : (
        <main className="workspace-main">
          {fixtureMode && (
            <div className="fixture-bar">
              <div>
                <p className="fixture-title">Development fixture</p>
                <p className="fixture-copy">
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

          <div className="workspace-body">
            <div className="workspace-layout">
              <aside className="conversation-column">
                <ConversationPanel
                  messages={state.messages}
                  needsWriterInput={state.needsWriterInput}
                  onSubmit={sendMessage}
                  busy={busy}
                />
              </aside>

              <div className="workspace-content">
                {state.phase === "conversation" ? (
                  <section className="clarification-panel panel">
                    <div>
                      <div className="clarification-mark">S</div>
                      <p className="eyebrow">Clarification</p>
                      <h2>Stewart is refining the investigation.</h2>
                      <p>
                        Answer in the conversation. Specialist activity will appear here when the
                        investigation begins.
                      </p>
                    </div>
                  </section>
                ) : (
                  <>
                    <InvestigationWorkspace state={state} />
                    <ReturnedInvestigations
                      results={state.completedInvestigations}
                      impact={state.impact}
                    />
                    {state.report ? (
                      <StewardshipReport
                        report={state.report}
                        impact={state.impact}
                        fixtureMode={fixtureMode}
                      />
                    ) : !specialistsInWorkspace ? (
                      <section className="synthesis-panel panel" aria-label="Stewart synthesis">
                        <div className="synthesis-mark">S</div>
                        <div>
                          <p className="eyebrow">Evidence assembled</p>
                          <h2>Stewart is preparing the Stewardship Report.</h2>
                        </div>
                      </section>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
