"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { brdApi, errorMessage } from "@/lib/api/client";
import type { BrdSummary } from "@/lib/api/types";

type LoadStatus = "loading" | "ready" | "error";

interface BrdsContextValue {
  brds: BrdSummary[];
  status: LoadStatus;
  error: string | null;
  reload: () => Promise<void>;
  upsert: (brd: BrdSummary) => void;
  /** Drops the BRD of a deleted session (removed in the database by cascade). */
  removeForSession: (sessionId: string) => void;
}

const BrdsContext = createContext<BrdsContextValue | null>(null);

function sortByActivity(brds: BrdSummary[]): BrdSummary[] {
  return [...brds].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
}

function toSummary(brd: BrdSummary): BrdSummary {
  const { id, title, status, completenessPercentage, sessionId, sessionTitle, createdAt, updatedAt } = brd;
  return { id, title, status, completenessPercentage, sessionId, sessionTitle, createdAt, updatedAt };
}

async function fetchBrds(): Promise<BrdSummary[] | Error> {
  try {
    return await brdApi.list();
  } catch (caught) {
    return caught instanceof Error ? caught : new Error(errorMessage(caught));
  }
}

export function BrdsProvider({ children }: { children: ReactNode }) {
  const [brds, setBrds] = useState<BrdSummary[]>([]);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  const applyResult = useCallback((result: BrdSummary[] | Error) => {
    if (result instanceof Error) {
      setError(errorMessage(result));
      setStatus("error");
    } else {
      setBrds(sortByActivity(result));
      setError(null);
      setStatus("ready");
    }
  }, []);

  const reload = useCallback(async () => {
    setStatus("loading");
    applyResult(await fetchBrds());
  }, [applyResult]);

  useEffect(() => {
    let active = true;
    void fetchBrds().then((result) => {
      if (active) applyResult(result);
    });
    return () => {
      active = false;
    };
  }, [applyResult]);

  const upsert = useCallback((brd: BrdSummary) => {
    setBrds((current) => sortByActivity([toSummary(brd), ...current.filter((item) => item.id !== brd.id)]));
  }, []);

  const removeForSession = useCallback((sessionId: string) => {
    setBrds((current) => current.filter((item) => item.sessionId !== sessionId));
  }, []);

  const value = useMemo(
    () => ({ brds, status, error, reload, upsert, removeForSession }),
    [brds, status, error, reload, upsert, removeForSession],
  );
  return <BrdsContext.Provider value={value}>{children}</BrdsContext.Provider>;
}

export function useBrds(): BrdsContextValue {
  const context = useContext(BrdsContext);
  if (!context) throw new Error("useBrds must be used inside BrdsProvider");
  return context;
}
