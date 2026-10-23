import { CircleAlert, MessagesSquare } from "lucide-react";
import type { ReactNode } from "react";

import { ASSISTANT_NAME } from "@/config/app";
import { formatFullDateTime, formatMessageTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export function DoraAvatar() {
  return (
    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
      <MessagesSquare className="size-4" aria-hidden />
    </span>
  );
}

function Timestamp({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} title={formatFullDateTime(iso)} className="text-[11px] text-muted-foreground">
      {formatMessageTime(iso)}
    </time>
  );
}

export function AssistantBubble({ content, createdAt }: { content: string; createdAt: string }) {
  return (
    <div className="flex max-w-full items-start gap-3">
      <DoraAvatar />
      <div className="min-w-0 max-w-[min(42rem,85%)]">
        <div className="mb-1 flex items-baseline gap-2">
          <span className="text-xs font-semibold">{ASSISTANT_NAME}</span>
          <Timestamp iso={createdAt} />
        </div>
        <div className="rounded-2xl rounded-tl-md border bg-card px-4 py-3 text-sm leading-relaxed break-words whitespace-pre-wrap text-card-foreground shadow-xs">
          {content}
        </div>
      </div>
    </div>
  );
}

interface UserBubbleProps {
  content: string;
  createdAt: string;
  status?: "sent" | "sending" | "failed";
  /** Shown below a failed message (error text and actions). */
  footer?: ReactNode;
}

export function UserBubble({ content, createdAt, status = "sent", footer }: UserBubbleProps) {
  return (
    <div className="flex max-w-full flex-col items-end">
      <div
        className={cn(
          "max-w-[min(42rem,85%)] rounded-2xl rounded-tr-md px-4 py-2.5 text-sm leading-relaxed break-words whitespace-pre-wrap shadow-xs",
          status === "failed"
            ? "border border-destructive/40 bg-destructive/5 text-foreground"
            : "bg-primary text-primary-foreground",
          status === "sending" && "opacity-80",
        )}
      >
        {content}
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {status === "failed" ? (
          <span className="flex items-center gap-1 font-medium text-destructive">
            <CircleAlert className="size-3" aria-hidden />
            Not sent
          </span>
        ) : status === "sending" ? (
          <span>Sending…</span>
        ) : (
          <Timestamp iso={createdAt} />
        )}
      </div>
      {footer}
    </div>
  );
}
