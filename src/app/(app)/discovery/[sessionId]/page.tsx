import type { Metadata } from "next";
import { Suspense } from "react";

import { LoadingState } from "@/components/common/loading-state";
import { SessionChat } from "@/components/discovery/session-chat";

export const metadata: Metadata = { title: "Discovery Session" };

export default function DiscoverySessionPage({ params }: PageProps<"/discovery/[sessionId]">) {
  return (
    <Suspense fallback={<LoadingState label="Loading conversation…" className="flex-1" />}>
      {params.then(({ sessionId }) => (
        <SessionChat key={sessionId} sessionId={sessionId} />
      ))}
    </Suspense>
  );
}
