import { useState, type FormEvent } from "react";

import type { ConversationMessage } from "../model/events";

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

interface ConversationPanelProps {
  messages: ConversationMessage[];
  needsWriterInput: boolean;
  onSubmit: (message: string) => Promise<void>;
  busy?: boolean;
}

export function ConversationPanel({
  messages,
  needsWriterInput,
  onSubmit,
  busy = false,
}: ConversationPanelProps) {
  return (
    <section className="conversation-panel panel" aria-label="Stewart conversation">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Conversation</p>
          <h2>Writer & Stewart</h2>
        </div>
        {needsWriterInput && <span className="attention-pill">Writer input needed</span>}
      </div>
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
        <PromptComposer onSubmit={onSubmit} disabled={busy} />
      </div>
    </section>
  );
}
