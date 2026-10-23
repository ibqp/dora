"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { AssistantRole } from "@/generated/prisma/enums";
import { ApiClientError, chatApi, errorMessage } from "@/lib/api/client";
import type { BrdReference, ChatMessageDto, ChatSessionDetail, ChatSessionSummary } from "@/lib/api/types";

/** A user message that has not been stored yet. */
export interface PendingMessage {
  /** Idempotency key; reused when the same message is retried. */
  clientRequestId: string;
  content: string;
  createdAt: string;
  status: "sending" | "failed";
  error: string | null;
  retryable: boolean;
}

interface UseDiscoveryChatOptions {
  initialSession: ChatSessionDetail | null;
  /** Called once when the first message has created the session. */
  onSessionCreated?: (session: ChatSessionDetail) => void;
  /** Called after each stored exchange or role change with the updated session. */
  onSessionUpdated?: (session: ChatSessionSummary) => void;
}

export type RoleChange =
  | { status: "idle" }
  | { status: "saving"; role: AssistantRole }
  | { status: "saved"; role: AssistantRole }
  | { status: "failed"; role: AssistantRole; error: string };

function appendUnique(messages: ChatMessageDto[], additions: readonly ChatMessageDto[]): ChatMessageDto[] {
  const known = new Set(messages.map((message) => message.id));
  return [...messages, ...additions.filter((message) => !known.has(message.id))];
}

/**
 * Chat state for one discovery conversation. Only one message can be in flight; a failed message
 * stays pending (not stored, not part of the history) until it is retried or discarded.
 */
export function useDiscoveryChat({ initialSession, onSessionCreated, onSessionUpdated }: UseDiscoveryChatOptions) {
  const [session, setSession] = useState<ChatSessionDetail | null>(initialSession);
  const [pending, setPending] = useState<PendingMessage | null>(null);
  /** Role chosen on New Discovery before the session exists (null = configured default). */
  const [selectedRole, setSelectedRole] = useState<AssistantRole | null>(null);
  const [roleChange, setRoleChange] = useState<RoleChange>({ status: "idle" });
  const selectedRoleRef = useRef(selectedRole);
  const sessionRef = useRef(session);
  const inFlight = useRef(false);
  const callbacks = useRef({ onSessionCreated, onSessionUpdated });

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  useEffect(() => {
    selectedRoleRef.current = selectedRole;
  }, [selectedRole]);
  useEffect(() => {
    callbacks.current = { onSessionCreated, onSessionUpdated };
  }, [onSessionCreated, onSessionUpdated]);

  const submit = useCallback(async (message: PendingMessage) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending({ ...message, status: "sending", error: null });
    setRoleChange((current) => (current.status === "saved" ? { status: "idle" } : current));

    try {
      const current = sessionRef.current;
      if (!current) {
        const created = await chatApi.create({
          content: message.content,
          clientRequestId: message.clientRequestId,
          ...(selectedRoleRef.current ? { assistantRole: selectedRoleRef.current } : {}),
        });
        sessionRef.current = created;
        setSession(created);
        setPending(null);
        callbacks.current.onSessionCreated?.(created);
      } else {
        const response = await chatApi.sendMessage(current.id, {
          content: message.content,
          clientRequestId: message.clientRequestId,
        });
        const next = {
          ...current,
          ...response.session,
          messages: appendUnique(current.messages, response.messages),
          requirements: response.requirements,
        };
        sessionRef.current = next;
        setSession(next);
        setPending(null);
        callbacks.current.onSessionUpdated?.(response.session);
      }
    } catch (caught) {
      setPending({
        ...message,
        status: "failed",
        error: errorMessage(caught),
        retryable: caught instanceof ApiClientError ? caught.isRetryable : true,
      });
    } finally {
      inFlight.current = false;
    }
  }, []);

  /** Sends a new message. Returns false if another message is still pending. */
  const send = useCallback(
    (content: string): boolean => {
      const trimmed = content.trim();
      if (!trimmed || inFlight.current || pending) return false;
      void submit({
        clientRequestId: crypto.randomUUID(),
        content: trimmed,
        createdAt: new Date().toISOString(),
        status: "sending",
        error: null,
        retryable: true,
      });
      return true;
    },
    [pending, submit],
  );

  /** Resends a failed message with the same idempotency key. */
  const retry = useCallback(() => {
    if (pending?.status === "failed") void submit(pending);
  }, [pending, submit]);

  /** Drops a failed message and returns its text so it can be edited. */
  const discard = useCallback((): string | null => {
    if (pending?.status !== "failed") return null;
    setPending(null);
    return pending.content;
  }, [pending]);

  /**
   * Changes DORA's role. Before the first message the choice is kept locally and sent with it;
   * for an existing session it is stored immediately. Collected requirements are not affected.
   */
  const changeRole = useCallback(async (role: AssistantRole) => {
    const current = sessionRef.current;
    if (!current) {
      setSelectedRole(role);
      return;
    }
    if (inFlight.current || role === current.assistantRole) return;
    setRoleChange({ status: "saving", role });
    try {
      const updated = await chatApi.update(current.id, { assistantRole: role });
      const next = { ...current, assistantRole: updated.assistantRole, updatedAt: updated.updatedAt };
      sessionRef.current = next;
      setSession(next);
      setRoleChange({ status: "saved", role });
      callbacks.current.onSessionUpdated?.(updated);
    } catch (caught) {
      setRoleChange({ status: "failed", role, error: errorMessage(caught) });
    }
  }, []);

  /** Records the session's newly generated BRD. */
  const attachBrd = useCallback((brd: BrdReference) => {
    const current = sessionRef.current;
    if (!current) return;
    const next = { ...current, brd };
    sessionRef.current = next;
    setSession(next);
  }, []);

  return {
    session,
    pending,
    attachBrd,
    isSending: pending?.status === "sending",
    selectedRole,
    roleChange,
    send,
    retry,
    discard,
    changeRole,
  };
}
