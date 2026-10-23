import { ASSISTANT_NAME } from "@/config/app";

import { DoraAvatar } from "./message-bubble";

export function TypingIndicator() {
  return (
    <div className="flex items-start gap-3" role="status" aria-live="polite">
      <DoraAvatar />
      <div className="flex items-center gap-2 rounded-2xl rounded-tl-md border bg-card px-4 py-3 shadow-xs">
        <span className="flex gap-1" aria-hidden>
          <span className="size-1.5 animate-pulse rounded-full bg-primary/70" />
          <span className="size-1.5 animate-pulse rounded-full bg-primary/70 [animation-delay:200ms]" />
          <span className="size-1.5 animate-pulse rounded-full bg-primary/70 [animation-delay:400ms]" />
        </span>
        <span className="text-sm text-muted-foreground">{ASSISTANT_NAME} is typing…</span>
      </div>
    </div>
  );
}
