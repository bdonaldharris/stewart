import { useCallback, useEffect, useRef, useState } from "react";

import { ConversationComposer, ConversationPanel } from "./components/ConversationPanel";
import { Header } from "./components/Header";
import { InvestigationWorkspace } from "./components/InvestigationWorkspace";
import { ReturnedInvestigations } from "./components/ReturnedInvestigations";
import { StewardshipReport } from "./components/StewardshipReport";
import { agentIds, type WriterRoomEvent, type WriterRoomEventBatch } from "./model/events";
import { createInitialState, reduceWriterRoomEvents } from "./model/state";
import {
  createConfiguredEventSource,
  type WriterRoomEventSource,
} from "./services/eventSource";
import { useVoiceMode } from "./voice/useVoiceMode";

interface AppProps {
  eventSource?: WriterRoomEventSource;
}

export function App({ eventSource }: AppProps) {
  const [state, setState] = useState(createInitialState);
  const stateRef = useRef(state);
  const [source, setSource] = useState<WriterRoomEventSource>(
    () => eventSource ?? createConfiguredEventSource(),
  );
  const [clarificationDemo, setClarificationDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [speechRevision, setSpeechRevision] = useState(0);
  const voice = useVoiceMode();
  const prepareVoiceEvents = voice.prepareEvents;
  const pendingSpeechEventsRef = useRef<WriterRoomEventBatch[]>([]);
  const pendingFinalEventsRef = useRef<WriterRoomEvent[]>([]);
  const impactCompletionCommittedRef = useRef(false);

  const fixtureMode = source.mode === "fixture";
  const specialistsInWorkspace = agentIds.some((agent) => {
    const status = state.agents[agent].status;
    return status !== "complete" && status !== "idle";
  });

  const applyEventsNow = useCallback(
    (events: WriterRoomEventBatch) => {
      if (events.length === 0) return;
      prepareVoiceEvents(events);
      stateRef.current = reduceWriterRoomEvents(stateRef.current, events);
      setState(stateRef.current);
      pendingSpeechEventsRef.current.push(events);
      setSpeechRevision((revision) => revision + 1);
    },
    [prepareVoiceEvents],
  );

  function applyEvents(events: WriterRoomEventBatch) {
    for (const event of events) {
      if (event.type === "investigation_started") {
        impactCompletionCommittedRef.current = false;
      }

      const investigationInProgress = stateRef.current.phase === "investigation";
      const deferFinalMessage =
        event.type === "stewart_message" &&
        !event.message.needsWriterInput &&
        investigationInProgress &&
        !impactCompletionCommittedRef.current;
      const deferReport =
        event.type === "report_ready" &&
        investigationInProgress &&
        !impactCompletionCommittedRef.current;

      if (deferFinalMessage || deferReport) {
        pendingFinalEventsRef.current.push(event);
        if (deferReport && stateRef.current.agents.impact.status !== "complete") {
          applyEventsNow([
            {
              type: "specialist_status",
              agent: "impact",
              status: "complete",
              activity: "Complete",
            },
          ]);
        }
        continue;
      }

      applyEventsNow([event]);
    }
  }

  useEffect(() => {
    const batches = pendingSpeechEventsRef.current.splice(0);
    batches.forEach(voice.observeEvents);
  }, [speechRevision, voice.observeEvents]);

  useEffect(() => {
    const impactComplete = state.agents.impact.status === "complete";
    impactCompletionCommittedRef.current = impactComplete;
    if (!impactComplete || pendingFinalEventsRef.current.length === 0) return;
    const pendingFinalEvents = pendingFinalEventsRef.current.splice(0);
    applyEventsNow(pendingFinalEvents);
  }, [applyEventsNow, state.agents.impact.status]);

  async function sendMessage(message: string) {
    if (stateRef.current.phase === "entry") voice.beginInitialTransition();
    setBusy(true);
    setError(undefined);
    try {
      if (source.mode === "backend") {
        await source.sendMessage(message, applyEvents);
      } else {
        applyEvents(await source.sendMessage(message));
      }
    } catch (caught) {
      pendingSpeechEventsRef.current.length = 0;
      pendingFinalEventsRef.current.length = 0;
      voice.handleTurnError();
      setError(caught instanceof Error ? caught.message : "Stewart could not process the message.");
    } finally {
      voice.completeTurn();
      setBusy(false);
    }
  }

  async function advanceFixture() {
    setBusy(true);
    try {
      const events = await source.advance();
      applyEvents(events);
    } catch (caught) {
      pendingSpeechEventsRef.current.length = 0;
      pendingFinalEventsRef.current.length = 0;
      voice.handleTurnError();
      setError(caught instanceof Error ? caught.message : "Stewart could not process the message.");
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

      {state.phase === "entry" || voice.workspaceTransitionPending ? (
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
            <ConversationComposer
              onSubmit={sendMessage}
              disabled={busy}
              initial
              mode={voice.mode}
              voiceAvailable={voice.available}
              voiceState={voice.state}
              voiceError={voice.error}
              finalTranscript={voice.finalTranscript}
              interimTranscript={voice.interimTranscript}
              analyser={voice.analyser}
              onModeChange={voice.setMode}
              onToggleListening={voice.toggleListening}
              onClearTranscript={voice.clearTranscript}
            />
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
        </main>
      ) : (
        <main className="workspace-main">
          {fixtureMode && source.canAdvance && (
            <div className="fixture-controls">
              <button
                type="button"
                onClick={advanceFixture}
                disabled={busy}
                className="fixture-advance"
                aria-label="Continue investigation"
              >
                Continue
                <span aria-hidden="true">→</span>
              </button>
            </div>
          )}

          <div className="workspace-body">
            <div className="workspace-layout">
              <aside className="conversation-column">
                <ConversationPanel
                  messages={state.messages}
                  onSubmit={sendMessage}
                  busy={busy}
                  mode={voice.mode}
                  voiceAvailable={voice.available}
                  voiceState={voice.state}
                  voiceError={voice.error}
                  finalTranscript={voice.finalTranscript}
                  interimTranscript={voice.interimTranscript}
                  analyser={voice.analyser}
                  onModeChange={voice.setMode}
                  onToggleListening={voice.toggleListening}
                  onClearTranscript={voice.clearTranscript}
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
                      <StewardshipReport report={state.report} />
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
