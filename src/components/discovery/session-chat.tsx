"use client";

import { MessageSquarePlus, RotateCcw, SearchX, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageContent } from "@/components/common/page-content";
import { useSessions } from "@/components/sessions/sessions-provider";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/config/navigation";
import { ApiClientError, chatApi, errorMessage } from "@/lib/api/client";
import type { ChatSessionDetail } from "@/lib/api/types";

import { ChatView } from "./chat-view";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; session: ChatSessionDetail }
  | { status: "not-found" }
  | { status: "error"; message: string };

async function fetchSession(sessionId: string): Promise<LoadState> {
  try {
    return { status: "ready", session: await chatApi.get(sessionId) };
  } catch (caught) {
    if (caught instanceof ApiClientError && (caught.status === 404 || caught.status === 400)) {
      return { status: "not-found" };
    }
    return { status: "error", message: errorMessage(caught) };
  }
}

/** Loads a stored session (messages, stage, role, progress) and continues the conversation. */
export function SessionChat({ sessionId }: { sessionId: string }) {
  const { upsert, peekCachedDetail, dropCachedDetail } = useSessions();
  // A session created on the New Discovery page is handed over without refetching.
  const [cached] = useState(() => peekCachedDetail(sessionId));
  const [state, setState] = useState<LoadState>(cached ? { status: "ready", session: cached.session } : { status: "loading" });

  useEffect(() => {
    dropCachedDetail(sessionId);
    if (cached) return;
    let active = true;
    void fetchSession(sessionId).then((next) => {
      if (active) setState(next);
    });
    return () => {
      active = false;
    };
  }, [cached, dropCachedDetail, sessionId]);

  function retryLoad() {
    setState({ status: "loading" });
    void fetchSession(sessionId).then(setState);
  }

  if (state.status === "loading") return <LoadingState label="Loading conversation…" className="flex-1" />;

  if (state.status === "not-found") {
    return (
      <PageContent width="narrow">
        <EmptyState
          headingLevel="h1"
          icon={SearchX}
          title="Discovery session not found"
          description="This session does not exist or has been deleted."
          action={
            <Button asChild variant="outline">
              <Link href={ROUTES.newDiscovery}>
                <MessageSquarePlus aria-hidden />
                Start a new discovery
              </Link>
            </Button>
          }
        />
      </PageContent>
    );
  }

  if (state.status === "error") {
    return (
      <PageContent width="narrow">
        <EmptyState
          headingLevel="h1"
          icon={TriangleAlert}
          title="The conversation could not be loaded"
          description={state.message}
          action={
            <Button variant="outline" onClick={retryLoad}>
              <RotateCcw aria-hidden />
              Try again
            </Button>
          }
        />
      </PageContent>
    );
  }

  return <ChatView key={sessionId} initialSession={state.session} initialDraft={cached?.draft} onSessionUpdated={upsert} />;
}
