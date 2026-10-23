"use client";

import { FileText, MessageSquarePlus, RotateCcw, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { LoadingState } from "@/components/common/loading-state";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/config/navigation";
import { formatFullDateTime } from "@/lib/format";

import { BrdStatusBadge } from "./brd-status-badge";
import { useBrds } from "./brds-provider";

export function BrdList() {
  const { brds, status, error, reload } = useBrds();

  if (status === "loading" && brds.length === 0) return <LoadingState label="Loading BRD documents…" />;

  if (status === "error") {
    return (
      <EmptyState
        icon={TriangleAlert}
        title="BRD documents could not be loaded"
        description={error}
        action={
          <Button variant="outline" onClick={() => void reload()}>
            <RotateCcw aria-hidden />
            Try again
          </Button>
        }
      />
    );
  }

  if (brds.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No BRD documents yet"
        description="Each discovery session can produce one BRD. Use “Generate BRD” in a discovery session to create it."
        action={
          <Button asChild variant="outline">
            <Link href={ROUTES.newDiscovery}>
              <MessageSquarePlus aria-hidden />
              Start a discovery
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <ul className="divide-y rounded-xl border bg-card">
      {brds.map((brd) => (
        <li key={brd.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4">
          <div className="min-w-0 flex-1 basis-64">
            <Link href={`/brds/${brd.id}`} className="block truncate font-medium hover:text-primary hover:underline">
              {brd.title}
            </Link>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              From discovery{" "}
              <Link href={`/discovery/${brd.sessionId}`} className="underline-offset-2 hover:underline">
                {brd.sessionTitle}
              </Link>{" "}
              · updated {formatFullDateTime(brd.updatedAt)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-sm text-muted-foreground tabular-nums">{brd.completenessPercentage}% complete</span>
            <BrdStatusBadge status={brd.status} />
          </div>
        </li>
      ))}
    </ul>
  );
}
