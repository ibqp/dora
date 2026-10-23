import type { Metadata } from "next";
import { Suspense } from "react";

import { LoadingState } from "@/components/common/loading-state";
import { BrdDocumentView } from "@/components/brds/brd-document-view";

export const metadata: Metadata = { title: "BRD" };

export default function BrdPage({ params }: PageProps<"/brds/[brdId]">) {
  return (
    <Suspense fallback={<LoadingState label="Loading BRD…" className="flex-1" />}>
      {params.then(({ brdId }) => (
        <BrdDocumentView key={brdId} brdId={brdId} />
      ))}
    </Suspense>
  );
}
