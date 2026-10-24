"use client";

import { RotateCcw, SearchX, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageContent } from "@/components/common/page-content";
import { Button } from "@/components/ui/button";
import { ApiClientError, brdApi, errorMessage } from "@/lib/api/client";
import type { BrdDetail } from "@/lib/api/types";

import { BrdEditor } from "./brd-editor";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; brd: BrdDetail }
  | { status: "not-found" }
  | { status: "error"; message: string };

async function fetchBrd(brdId: string): Promise<LoadState> {
  try {
    return { status: "ready", brd: await brdApi.get(brdId) };
  } catch (caught) {
    if (caught instanceof ApiClientError && (caught.status === 404 || caught.status === 400)) return { status: "not-found" };
    return { status: "error", message: errorMessage(caught) };
  }
}

/** Loads the stored BRD and opens it in the editor. */
export function BrdDocumentView({ brdId }: { brdId: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    // Runs again whenever the page becomes visible (Activity). A failed refresh keeps the
    // loaded document, so unsaved edits are not lost.
    void fetchBrd(brdId).then((next) => {
      if (active) setState((current) => (current.status === "ready" && next.status === "error" ? current : next));
    });
    return () => {
      active = false;
    };
  }, [brdId]);

  if (state.status === "loading") return <LoadingState label="Loading BRD…" className="flex-1" />;

  if (state.status === "not-found") {
    return (
      <PageContent width="narrow">
        <EmptyState
          headingLevel="h1"
          icon={SearchX}
          title="BRD not found"
          description="This BRD does not exist or its discovery session has been deleted."
          action={
            <Button asChild variant="outline">
              <Link href="/brds">All BRD documents</Link>
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
          title="The BRD could not be loaded"
          description={state.message}
          action={
            <Button
              variant="outline"
              onClick={() => {
                setState({ status: "loading" });
                void fetchBrd(brdId).then(setState);
              }}
            >
              <RotateCcw aria-hidden />
              Try again
            </Button>
          }
        />
      </PageContent>
    );
  }

  return <BrdEditor brd={state.brd} />;
}
