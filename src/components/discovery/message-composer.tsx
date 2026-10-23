"use client";

import { ArrowUp, LoaderCircle } from "lucide-react";
import { useEffect, useRef, type FormEvent, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MAX_MESSAGE_LENGTH } from "@/lib/api/chat-schemas";
import { cn } from "@/lib/utils";

interface MessageComposerProps {
  value: string;
  onChange: (value: string) => void;
  /** Returns true when the message was accepted for sending. */
  onSend: (value: string) => boolean;
  /** A message is being processed: typing stays possible, sending is blocked. */
  busy: boolean;
  /** Sending is blocked for another reason (e.g. a failed message awaits retry or discard). */
  blocked?: boolean;
  placeholder?: string;
}

const COUNTER_THRESHOLD = MAX_MESSAGE_LENGTH - 500;

export function MessageComposer({ value, onChange, onSend, busy, blocked = false, placeholder }: MessageComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const tooLong = value.length > MAX_MESSAGE_LENGTH;
  const canSend = value.trim().length > 0 && !tooLong && !busy && !blocked;

  useEffect(() => {
    if (!busy) textareaRef.current?.focus();
  }, [busy]);

  function submit() {
    if (!canSend) return;
    if (onSend(value)) onChange("");
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter inserts a newline; never send while an IME composition is active.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="shrink-0 border-t bg-background px-6 py-4 lg:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-end gap-2 rounded-2xl border bg-card p-2 shadow-xs focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30">
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder={placeholder ?? "Message DORA…"}
            aria-label="Message DORA"
            aria-invalid={tooLong || undefined}
            className="max-h-48 min-h-10 resize-none border-0 bg-transparent px-2 py-2 shadow-none focus-visible:ring-0"
          />
          <Button
            type="submit"
            size="icon-lg"
            disabled={!canSend}
            aria-label={busy ? "DORA is responding" : "Send message"}
            className="shrink-0 rounded-xl"
          >
            {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : <ArrowUp aria-hidden />}
          </Button>
        </div>
        <div className="mt-1.5 flex justify-between gap-4 px-1 text-[11px] text-muted-foreground">
          <span>Enter to send · Shift+Enter for a new line</span>
          {value.length > COUNTER_THRESHOLD ? (
            <span className={cn(tooLong && "font-medium text-destructive")}>
              {value.length} / {MAX_MESSAGE_LENGTH}
            </span>
          ) : null}
        </div>
      </div>
    </form>
  );
}
