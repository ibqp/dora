"use client";

import { CircleAlert, FileText, Info, LoaderCircle, MessagesSquare, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { useSessions } from "@/components/sessions/sessions-provider";
import { Button } from "@/components/ui/button";
import { ASSISTANT_NAME } from "@/config/app";
import type { AssistantRole } from "@/generated/prisma/enums";
import { useDiscoveryChat, type PendingMessage, type RoleChange } from "@/hooks/use-discovery-chat";
import { useProgressPanel } from "@/hooks/use-progress-panel";
import { errorMessage, settingsApi } from "@/lib/api/client";
import type {
  ChatMessageDto,
  ChatSessionDetail,
  ChatSessionSummary,
  MissingRequirement,
  RequirementsProgress,
} from "@/lib/api/types";
import { FieldStatus } from "@/lib/requirements/fields";
import { buildRequirementsProgress } from "@/lib/mock-ai/progress";
import { ROLE_PROFILES } from "@/lib/mock-ai/roles";
import { createInitialDiscoveryState } from "@/lib/mock-ai/state";

import { ChatHeader } from "./chat-header";
import { AssistantBubble, UserBubble } from "./message-bubble";
import { MessageComposer } from "./message-composer";
import { ProgressPanel } from "./progress-panel";
import { RoleSelect } from "./role-select";
import { useBrdGeneration } from "./use-brd-generation";
import { TypingIndicator } from "./typing-indicator";

interface ChatViewProps {
  initialSession: ChatSessionDetail | null;
  initialDraft?: string;
  /** Receives the created session and the text typed in the composer meanwhile. */
  onSessionCreated?: (session: ChatSessionDetail, draft: string) => void;
  onSessionUpdated?: (session: ChatSessionSummary) => void;
}

/** Progress of a discovery that has not started yet (computed locally; nothing is stored). */
const EMPTY_PROGRESS: RequirementsProgress = buildRequirementsProgress(createInitialDiscoveryState());

/** Default role from the settings, shown before the first message of a New Discovery. */
function useDefaultRole(enabled: boolean): AssistantRole | null {
  const [role, setRole] = useState<AssistantRole | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    settingsApi.get().then(
      (settings) => active && setRole(settings.defaultAssistantRole),
      // Without the setting the server applies the default role itself; the dropdown stays usable.
      (error: unknown) => console.warn("Default role unavailable:", errorMessage(error)),
    );
    return () => {
      active = false;
    };
  }, [enabled]);
  return role;
}

export function ChatView({ initialSession, initialDraft = "", onSessionCreated, onSessionUpdated }: ChatViewProps) {
  const [draft, setDraft] = useState(initialDraft);
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  const handleCreated = useCallback(
    (created: ChatSessionDetail) => onSessionCreated?.(created, draftRef.current),
    [onSessionCreated],
  );
  const { session, pending, isSending, selectedRole, roleChange, send, retry, discard, changeRole, attachBrd } = useDiscoveryChat({
    initialSession,
    onSessionCreated: handleCreated,
    onSessionUpdated,
  });
  const defaultRole = useDefaultRole(initialSession === null);
  const panel = useProgressPanel();
  const role = session?.assistantRole ?? selectedRole ?? defaultRole;
  const progress = session?.requirements ?? EMPTY_PROGRESS;
  const missing: MissingRequirement[] = progress.sections
    .flatMap((section) => section.fields)
    .filter((field) => field.status !== FieldStatus.PROVIDED)
    .map(({ key, label, status }) => ({ key, label, status }));
  const brdGeneration = useBrdGeneration({ sessionId: session?.id ?? null, missing, onGenerated: attachBrd });
  // DORA suggests the BRD once the requirements review has been confirmed.
  const brdSuggested = session?.currentStage === "BRD_GENERATION" && !session.brd;

  const brdAction = session?.brd ? (
    <Button asChild size="sm">
      <Link href={`/brds/${session.brd.id}`}>
        <FileText aria-hidden />
        Open BRD
      </Link>
    </Button>
  ) : (
    <Button
      size="sm"
      onClick={brdGeneration.request}
      disabled={!session || isSending || brdGeneration.pending}
      title={session ? "Generate a BRD from the collected requirements" : "Send a first message to start the session"}
    >
      {brdGeneration.pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <FileText aria-hidden />}
      Generate BRD
    </Button>
  );
  // The sidebar list holds the latest title (it changes when the session is renamed there).
  const { sessions } = useSessions();
  const title = sessions.find((s) => s.id === session?.id)?.title ?? session?.title ?? "New Discovery";

  function handleDiscard() {
    const content = discard();
    // Put the message back for editing without losing anything typed meanwhile.
    if (content !== null) setDraft((current) => (current.trim() === "" ? content : `${content}\n\n${current}`));
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ChatHeader
        title={title}
        stage={session?.currentStage ?? "INITIAL_REQUEST"}
        completenessPercentage={progress.completenessPercentage}
        roleControl={
          <RoleSelect
            value={role}
            onChange={(next) => void changeRole(next)}
            disabled={isSending || roleChange.status === "saving"}
          />
        }
        brdAction={brdAction}
        progressOpen={panel.open}
        onToggleProgress={panel.toggle}
      />
      {brdGeneration.dialog}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <MessageList
            messages={session?.messages ?? []}
            pending={pending}
            onRetry={retry}
            onDiscard={handleDiscard}
          />
          {brdSuggested ? (
            <BrdSuggestion onGenerate={brdGeneration.request} disabled={isSending || brdGeneration.pending} />
          ) : null}
          {brdGeneration.error ? (
            <div className="mx-auto w-full max-w-3xl px-6 lg:px-8">
              <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                The BRD could not be generated. {brdGeneration.error}
              </p>
            </div>
          ) : null}
          <RoleChangeNotice change={roleChange} />
          <MessageComposer
            value={draft}
            onChange={setDraft}
            onSend={send}
            busy={isSending}
            blocked={pending?.status === "failed" || roleChange.status === "saving"}
            placeholder={session ? undefined : "Describe your analytics request…"}
          />
        </div>
        {panel.open ? <ProgressPanel progress={progress} onClose={panel.toggle} /> : null}
      </div>
    </div>
  );
}

function BrdSuggestion({ onGenerate, disabled }: { onGenerate: () => void; disabled: boolean }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 pb-1 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-accent px-4 py-3">
        <p className="flex items-center gap-2 text-sm text-accent-foreground">
          <Sparkles className="size-4 shrink-0" aria-hidden />
          DORA suggests generating the BRD from the confirmed requirements.
        </p>
        <Button size="sm" onClick={onGenerate} disabled={disabled}>
          <FileText aria-hidden />
          Generate BRD
        </Button>
      </div>
    </div>
  );
}

function RoleChangeNotice({ change }: { change: RoleChange }) {
  if (change.status === "idle") return null;
  const label = ROLE_PROFILES[change.role].label;
  return (
    <div className="mx-auto w-full max-w-3xl px-6 lg:px-8" aria-live="polite">
      <p
        role={change.status === "failed" ? "alert" : "status"}
        className={
          change.status === "failed"
            ? "flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"
            : "flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground"
        }
      >
        {change.status === "saving" ? (
          <LoaderCircle className="mt-px size-3.5 shrink-0 animate-spin" aria-hidden />
        ) : change.status === "failed" ? (
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
        ) : (
          <Info className="mt-px size-3.5 shrink-0" aria-hidden />
        )}
        <span>
          {change.status === "saving"
            ? `Switching to ${label}…`
            : change.status === "saved"
              ? `Role changed to ${label}. DORA applies it from the next response; the conversation and collected requirements are kept.`
              : `The role could not be changed to ${label}. ${change.error}`}
        </span>
      </p>
    </div>
  );
}

interface MessageListProps {
  messages: ChatMessageDto[];
  pending: PendingMessage | null;
  onRetry: () => void;
  onDiscard: () => void;
}

function MessageList({ messages, pending, onRetry, onDiscard }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const initialScroll = useRef(true);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end", behavior: initialScroll.current ? "auto" : "smooth" });
    initialScroll.current = false;
  }, [messages.length, pending?.status, pending?.clientRequestId]);

  const isEmpty = messages.length === 0 && !pending;

  return (
    <div className="relative min-h-0 flex-1 overflow-y-auto">
      <div
        role="log"
        aria-label="Conversation"
        aria-live="polite"
        className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-6 py-6 lg:px-8"
      >
        {isEmpty ? (
          <EmptyState
            icon={MessagesSquare}
            variant="plain"
            className="py-16"
            title={`Start a discovery with ${ASSISTANT_NAME}`}
            description="Describe your analytics request in your own words, for example the report or analysis you have in mind. DORA will first ask about the business problem behind it. The session is saved when you send your first message."
          />
        ) : null}

        {messages.map((message) =>
          message.role === "USER" ? (
            <UserBubble key={message.id} content={message.content} createdAt={message.createdAt} />
          ) : (
            <AssistantBubble key={message.id} content={message.content} createdAt={message.createdAt} />
          ),
        )}

        {pending ? (
          <UserBubble
            content={pending.content}
            createdAt={pending.createdAt}
            status={pending.status}
            footer={
              pending.status === "failed" ? (
                <div role="alert" className="mt-2 flex max-w-[min(42rem,85%)] flex-col items-end gap-2">
                  <p className="text-right text-xs text-destructive">{pending.error}</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={onDiscard}>
                      <Trash2 aria-hidden />
                      Discard
                    </Button>
                    {pending.retryable ? (
                      <Button size="sm" variant="outline" onClick={onRetry}>
                        <RotateCcw aria-hidden />
                        Retry
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null
            }
          />
        ) : null}

        {pending?.status === "sending" ? <TypingIndicator /> : null}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
