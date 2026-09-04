import { useEffect, useRef, useState, type FormEvent } from "react";

import type { ConversationMessage } from "../model/events";
import type { ConversationMode, VoiceInteractionState } from "../voice/browserVoice";

interface PromptComposerProps {
  onSubmit: (message: string) => Promise<void>;
  disabled?: boolean;
  initial?: boolean;
}

export function PromptComposer({ onSubmit, disabled = false, initial = false }: PromptComposerProps) {
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = message.trim();
    if (!value || disabled) return;
    await onSubmit(value);
    setMessage("");
  }

  return (
    <form onSubmit={handleSubmit} className={`composer ${initial ? "composer-entry" : ""}`}>
      <label htmlFor={initial ? "entry-prompt" : "conversation-prompt"} className="sr-only">
        Describe your story idea
      </label>
      <textarea
        id={initial ? "entry-prompt" : "conversation-prompt"}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
        rows={initial ? 4 : 3}
        disabled={disabled}
        autoFocus={initial}
        placeholder="Describe the story idea you want Stewart to investigate…"
        className="composer-input"
      />
      <div className="mt-4 flex items-center justify-between gap-4">
        <p className="composer-hint">
          ENTER TO SEND · SHIFT + ENTER FOR A NEW LINE
        </p>
        <button
          type="submit"
          disabled={disabled || !message.trim()}
          className="send-button"
          aria-label="Send proposal to Stewart"
        >
          <span>Send</span>
          <span aria-hidden="true">↗</span>
        </button>
      </div>
    </form>
  );
}

interface VoiceWaveformProps {
  analyser?: AnalyserNode;
  active: boolean;
  speaking: boolean;
}

function VoiceWaveform({ analyser, active, speaking }: VoiceWaveformProps) {
  const barsRef = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    if (!active || !analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    let frame = 0;

    const draw = () => {
      analyser.getByteFrequencyData(data);
      barsRef.current.forEach((bar, index) => {
        if (!bar) return;
        const sample = data[Math.min(index, data.length - 1)] ?? 0;
        bar.style.transform = `scaleY(${Math.max(0.12, sample / 180)})`;
      });
      frame = window.requestAnimationFrame(draw);
    };

    draw();
    return () => window.cancelAnimationFrame(frame);
  }, [active, analyser]);

  return (
    <div
      className={`voice-waveform ${active ? "voice-waveform-listening" : ""} ${speaking ? "voice-waveform-speaking" : ""}`}
      aria-hidden="true"
    >
      {Array.from({ length: 12 }, (_, index) => (
        <span
          key={index}
          ref={(element) => {
            barsRef.current[index] = element;
          }}
        />
      ))}
    </div>
  );
}

interface ConversationComposerProps extends PromptComposerProps {
  mode: ConversationMode;
  voiceAvailable: boolean;
  voiceState: VoiceInteractionState;
  voiceError?: string;
  finalTranscript: string;
  interimTranscript: string;
  analyser?: AnalyserNode;
  onModeChange: (mode: ConversationMode) => void;
  onToggleListening: () => Promise<void>;
  onClearTranscript: () => void;
}

export function ConversationComposer({
  onSubmit,
  disabled = false,
  initial = false,
  mode,
  voiceAvailable,
  voiceState,
  voiceError,
  finalTranscript,
  interimTranscript,
  analyser,
  onModeChange,
  onToggleListening,
  onClearTranscript,
}: ConversationComposerProps) {
  const derivedState =
    disabled && voiceState !== "speaking" && voiceState !== "listening"
      ? "processing"
      : voiceState;
  const statusLabel = {
    ready: finalTranscript ? "Transcript ready" : "Ready to listen",
    listening: "Listening",
    processing: "Processing speech",
    speaking: "Stewart is speaking",
    error: "Voice needs attention",
  }[derivedState];

  async function sendTranscript() {
    const transcript = finalTranscript.trim();
    if (!transcript || disabled) return;
    await onSubmit(transcript);
    onClearTranscript();
  }

  return (
    <div className={`composer-shell ${initial ? "composer-shell-entry" : ""}`}>
      <div className="composer-mode-row">
        <div className="composer-mode-toggle" role="radiogroup" aria-label="Conversation mode">
          <button
            type="button"
            role="radio"
            aria-checked={mode === "text"}
            className={mode === "text" ? "composer-mode-active" : ""}
            onClick={() => onModeChange("text")}
          >
            Text
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === "voice"}
            aria-describedby={!voiceAvailable ? "voice-unavailable" : undefined}
            className={mode === "voice" ? "composer-mode-active" : ""}
            disabled={!voiceAvailable}
            onClick={() => onModeChange("voice")}
          >
            Voice
          </button>
        </div>
        {!voiceAvailable && (
          <p id="voice-unavailable" className="voice-unavailable">
            Voice is unavailable in this browser.
          </p>
        )}
      </div>

      {mode === "text" ? (
        <PromptComposer onSubmit={onSubmit} disabled={disabled} initial={initial} />
      ) : (
        <div className={`composer voice-composer ${initial ? "composer-entry" : ""}`}>
          <div className="voice-control-row">
            <button
              type="button"
              className={`microphone-button ${derivedState === "listening" ? "microphone-button-active" : ""}`}
              aria-label={derivedState === "listening" ? "Stop listening" : "Start listening"}
              aria-pressed={derivedState === "listening"}
              disabled={
                derivedState === "processing" || (disabled && derivedState !== "speaking")
              }
              onClick={() => void onToggleListening()}
            >
              <span aria-hidden="true">{derivedState === "listening" ? "■" : "●"}</span>
            </button>
            <VoiceWaveform
              analyser={analyser}
              active={derivedState === "listening"}
              speaking={derivedState === "speaking"}
            />
            <p className="voice-status" aria-live="polite">
              {statusLabel}
            </p>
          </div>

          <div className="voice-transcript" aria-live="polite">
            {finalTranscript ? (
              <p>{finalTranscript}</p>
            ) : interimTranscript ? (
              <p className="voice-transcript-interim">{interimTranscript}</p>
            ) : (
              <p className="voice-transcript-placeholder">Your transcript will appear here.</p>
            )}
          </div>

          {voiceError && (
            <p className="voice-error" role="status">
              {voiceError}
            </p>
          )}

          <div className="voice-footer">
            <p className="voice-disclosure">
              Voice recognition is provided by your browser and may use its speech service. Audio is
              not sent to Stewart&apos;s backend.
            </p>
            <button
              type="button"
              disabled={
                disabled ||
                derivedState === "listening" ||
                derivedState === "processing" ||
                !finalTranscript.trim()
              }
              className="send-button"
              aria-label="Send transcript to Stewart"
              onClick={() => void sendTranscript()}
            >
              <span>Send</span>
              <span aria-hidden="true">↗</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface ConversationPanelProps {
  messages: ConversationMessage[];
  onSubmit: (message: string) => Promise<void>;
  busy?: boolean;
  mode: ConversationMode;
  voiceAvailable: boolean;
  voiceState: VoiceInteractionState;
  voiceError?: string;
  finalTranscript: string;
  interimTranscript: string;
  analyser?: AnalyserNode;
  onModeChange: (mode: ConversationMode) => void;
  onToggleListening: () => Promise<void>;
  onClearTranscript: () => void;
}

export function ConversationPanel({
  messages,
  onSubmit,
  busy = false,
  mode,
  voiceAvailable,
  voiceState,
  voiceError,
  finalTranscript,
  interimTranscript,
  analyser,
  onModeChange,
  onToggleListening,
  onClearTranscript,
}: ConversationPanelProps) {
  return (
    <section className="conversation-panel panel" aria-label="Stewart conversation">
      <div className="conversation-scroll">
        {messages.map((message) => (
          <article
            key={message.id}
            className={`message ${message.speaker === "writer" ? "message-writer" : "message-stewart"}`}
          >
            <p className="message-speaker">
              {message.speaker === "writer" ? "Writer" : "Stewart"}
            </p>
            <p className="message-copy">{message.text}</p>
          </article>
        ))}
      </div>
      <div className="conversation-composer">
        <ConversationComposer
          onSubmit={onSubmit}
          disabled={busy}
          mode={mode}
          voiceAvailable={voiceAvailable}
          voiceState={voiceState}
          voiceError={voiceError}
          finalTranscript={finalTranscript}
          interimTranscript={interimTranscript}
          analyser={analyser}
          onModeChange={onModeChange}
          onToggleListening={onToggleListening}
          onClearTranscript={onClearTranscript}
        />
      </div>
    </section>
  );
}
