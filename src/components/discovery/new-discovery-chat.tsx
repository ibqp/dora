"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { useSessions } from "@/components/sessions/sessions-provider";
import type { ChatSessionDetail } from "@/lib/api/types";

import { ChatView } from "./chat-view";

/**
 * Empty chat. No session exists until the first message has been stored.
 *
 * Next.js keeps visited pages alive in a hidden <Activity>. A New Discovery must nevertheless
 * start empty: the chat is keyed by `bfcacheId` (fresh on every link/push/replace navigation),
 * and once its session has been handed over to the session page, the hidden copy is reset.
 */
export function NewDiscoveryChat() {
  const router = useRouter();
  const { upsert, cacheDetail } = useSessions();
  const [resets, setResets] = useState(0);
  const visible = useRef(true);
  const sessionCreated = useRef(false);

  useEffect(() => {
    visible.current = true;
    return () => {
      visible.current = false;
    };
  }, []);

  // Cleanup runs synchronously when Activity hides the page (or it unmounts).
  useLayoutEffect(() => {
    return () => {
      if (sessionCreated.current) {
        sessionCreated.current = false;
        setResets((count) => count + 1);
      }
    };
  }, []);

  const handleCreated = useCallback(
    (session: ChatSessionDetail, draft: string) => {
      upsert(session);
      if (!visible.current) {
        // The user navigated away while DORA was typing: don't pull them back, just start over.
        setResets((count) => count + 1);
        return;
      }
      sessionCreated.current = true;
      cacheDetail(session, draft);
      router.replace(`/discovery/${session.id}`);
    },
    [cacheDetail, router, upsert],
  );

  return (
    <ChatView
      key={`${router.bfcacheId}:${resets}`}
      initialSession={null}
      onSessionCreated={handleCreated}
      onSessionUpdated={upsert}
    />
  );
}
