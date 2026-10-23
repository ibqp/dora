"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { chatApi, errorMessage } from "@/lib/api/client";
import type { ChatSessionDetail, ChatSessionSummary } from "@/lib/api/types";

type LoadStatus = "loading" | "ready" | "error";

interface SessionsContextValue {
  sessions: ChatSessionSummary[];
  status: LoadStatus;
  error: string | null;
  reload: () => Promise<void>;
  /** Inserts or replaces a session in the list (e.g. after a new message). */
  upsert: (session: ChatSessionSummary) => void;
  rename: (sessionId: string, title: string) => Promise<ChatSessionSummary>;
  remove: (sessionId: string) => Promise<void>;
  /** Hands a freshly created session (and any unsent draft) to its page without refetching. */
  cacheDetail: (session: ChatSessionDetail, draft?: string) => void;
  peekCachedDetail: (sessionId: string) => CachedSession | undefined;
  dropCachedDetail: (sessionId: string) => void;
}

export interface CachedSession {
  session: ChatSessionDetail;
  draft: string;
}

const SessionsContext = createContext<SessionsContextValue | null>(null);

function sortByActivity(sessions: ChatSessionSummary[]): ChatSessionSummary[] {
  return [...sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
}

async function fetchSessions(): Promise<ChatSessionSummary[] | Error> {
  try {
    return await chatApi.list();
  } catch (caught) {
    return caught instanceof Error ? caught : new Error(errorMessage(caught));
  }
}

function toSummary(session: ChatSessionSummary): ChatSessionSummary {
  const { id, title, scenario, assistantRole, currentStage, createdAt, updatedAt } = session;
  return { id, title, scenario, assistantRole, currentStage, createdAt, updatedAt };
}

export function SessionsProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const detailCache = useRef(new Map<string, CachedSession>());

  const applyResult = useCallback((result: ChatSessionSummary[] | Error) => {
    if (result instanceof Error) {
      setError(errorMessage(result));
      setStatus("error");
    } else {
      setSessions(sortByActivity(result));
      setError(null);
      setStatus("ready");
    }
  }, []);

  const reload = useCallback(async () => {
    setStatus("loading");
    applyResult(await fetchSessions());
  }, [applyResult]);

  useEffect(() => {
    let active = true;
    void fetchSessions().then((result) => {
      if (active) applyResult(result);
    });
    return () => {
      active = false;
    };
  }, [applyResult]);

  const upsert = useCallback((session: ChatSessionSummary) => {
    setSessions((current) => sortByActivity([toSummary(session), ...current.filter((s) => s.id !== session.id)]));
  }, []);

  const rename = useCallback(
    async (sessionId: string, title: string) => {
      const updated = await chatApi.update(sessionId, { title });
      upsert(updated);
      return updated;
    },
    [upsert],
  );

  const remove = useCallback(async (sessionId: string) => {
    await chatApi.remove(sessionId);
    detailCache.current.delete(sessionId);
    setSessions((current) => current.filter((s) => s.id !== sessionId));
  }, []);

  const cacheDetail = useCallback((session: ChatSessionDetail, draft = "") => {
    detailCache.current.set(session.id, { session, draft });
  }, []);

  const peekCachedDetail = useCallback((sessionId: string) => detailCache.current.get(sessionId), []);

  const dropCachedDetail = useCallback((sessionId: string) => {
    detailCache.current.delete(sessionId);
  }, []);

  const value = useMemo(
    () => ({ sessions, status, error, reload, upsert, rename, remove, cacheDetail, peekCachedDetail, dropCachedDetail }),
    [sessions, status, error, reload, upsert, rename, remove, cacheDetail, peekCachedDetail, dropCachedDetail],
  );

  return <SessionsContext.Provider value={value}>{children}</SessionsContext.Provider>;
}

export function useSessions(): SessionsContextValue {
  const context = useContext(SessionsContext);
  if (!context) throw new Error("useSessions must be used inside SessionsProvider");
  return context;
}
