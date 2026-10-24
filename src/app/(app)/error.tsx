"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { PageContent } from "@/components/common/page-content";
import { Button } from "@/components/ui/button";

export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PageContent width="narrow">
      <EmptyState
        headingLevel="h1"
        icon={TriangleAlert}
        title="Something went wrong"
        description="This page could not be displayed. Try again, or use the navigation to continue."
        action={
          <Button variant="outline" onClick={() => retry()}>
            <RotateCcw aria-hidden />
            Try again
          </Button>
        }
      />
    </PageContent>
  );
}
