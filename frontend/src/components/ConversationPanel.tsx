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
        className="w-full resize-none bg-transparent text-[0.98rem] leading-7 text-slate-100 outline-none placeholder:text-slate-500 disabled:opacity-60 sm:text-base"
      />
      <div className="mt-4 flex items-center justify-between gap-4">
        <p className="text-[0.68rem] tracking-[0.08em] text-slate-500">
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
    <section className="panel flex min-h-[420px] flex-col overflow-hidden" aria-label="Stewart conversation">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Conversation</p>
          <h2 className="mt-1 text-lg font-medium text-slate-100">Writer & Stewart</h2>
        </div>
        {needsWriterInput && <span className="attention-pill">Writer input needed</span>}
      </div>
      <div className="conversation-scroll flex-1 space-y-5 overflow-y-auto px-5 py-6">
        {messages.map((message) => (
          <article
            key={message.id}
            className={`message ${message.speaker === "writer" ? "message-writer" : "message-stewart"}`}
          >
            <p className="mb-2 text-[0.65rem] font-semibold tracking-[0.22em] text-slate-500 uppercase">
              {message.speaker === "writer" ? "Writer" : "Stewart"}
            </p>
            <p className="text-sm leading-6 text-slate-200">{message.text}</p>
          </article>
        ))}
      </div>
      <div className="border-t border-white/8 p-4">
        <PromptComposer onSubmit={onSubmit} disabled={busy} />
      </div>
    </section>
  );
}
