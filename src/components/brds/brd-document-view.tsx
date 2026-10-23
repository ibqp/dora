"use client";

import { ArrowLeft, CircleAlert, RotateCcw, SearchX, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageContent } from "@/components/common/page-content";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { ApiClientError, brdApi, errorMessage } from "@/lib/api/client";
import type { BrdDetail, BrdFieldView } from "@/lib/api/types";
import { NOT_SPECIFIED } from "@/lib/brd/generation";
import { formatFullDateTime } from "@/lib/format";

import { BrdStatusBadge } from "./brd-status-badge";

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

/** Read-only BRD document, loaded from the stored BRD. */
export function BrdDocumentView({ brdId }: { brdId: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    void fetchBrd(brdId).then((next) => {
      if (active) setState(next);
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

  const { brd } = state;
  return (
    <>
      <PageHeader
        eyebrow="Business Requirements Document"
        title={brd.title}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={`/discovery/${brd.sessionId}`}>
              <ArrowLeft aria-hidden />
              Back to Discovery
            </Link>
          </Button>
        }
      />
      <PageContent width="narrow">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl border bg-card p-5 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">Status</dt>
            <dd className="mt-1">
              <BrdStatusBadge status={brd.status} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Completeness</dt>
            <dd className="mt-1 font-medium tabular-nums">{brd.completenessPercentage}%</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Created</dt>
            <dd className="mt-1">{formatFullDateTime(brd.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Updated</dt>
            <dd className="mt-1">{formatFullDateTime(brd.updatedAt)}</dd>
          </div>
          <div className="col-span-full">
            <dt className="text-xs text-muted-foreground">Source discovery session</dt>
            <dd className="mt-1 truncate">
              <Link href={`/discovery/${brd.sessionId}`} className="font-medium text-primary hover:underline">
                {brd.sessionTitle}
              </Link>
            </dd>
          </div>
        </dl>

        {brd.missingFields.length > 0 ? (
          <p className="mt-4 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-sm">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <span>
              {brd.missingFields.length} required field{brd.missingFields.length === 1 ? " is" : "s are"} not specified,
              so this BRD is a draft. Status “Ready for Review” requires all required fields — it reflects completeness,
              not business approval.
            </span>
          </p>
        ) : null}

        <div className="mt-6 space-y-5">
          {brd.sections.map((section, index) => (
            <section key={section.key} aria-labelledby={`section-${section.key}`} className="rounded-xl border bg-card">
              <h2 id={`section-${section.key}`} className="border-b px-5 py-3 text-base font-semibold">
                <span className="mr-2 text-primary">{index + 1}.</span>
                {section.title}
              </h2>
              <dl className="divide-y">
                {section.fields.map((field) => (
                  <BrdField key={field.key} field={field} />
                ))}
              </dl>
            </section>
          ))}
        </div>
      </PageContent>
    </>
  );
}

function BrdField({ field }: { field: BrdFieldView }) {
  return (
    <div className="grid gap-1 px-5 py-3 sm:grid-cols-[14rem_1fr] sm:gap-4">
      <dt className="text-sm font-medium text-muted-foreground">{field.label}</dt>
      <dd className="min-w-0 text-sm break-words whitespace-pre-wrap">
        {field.value ?? (
          <span className="inline-flex items-center gap-1.5 text-warning italic">
            <CircleAlert className="size-3.5" aria-hidden />
            {NOT_SPECIFIED}
          </span>
        )}
      </dd>
    </div>
  );
}
