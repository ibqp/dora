import { LoaderCircle } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface LoadingStateProps {
  label?: string;
  className?: string;
}

/** Inline spinner with an accessible label, for sections that are loading. */
export function LoadingState({ label = "Loading…", className }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground",
        className,
      )}
    >
      <LoaderCircle className="size-4 animate-spin text-primary" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

/** Skeleton for a full page (header + content blocks), used by route-level loading files. */
export function PageLoadingSkeleton() {
  return (
    <div role="status" aria-label="Loading page" className="flex flex-1 flex-col">
      <div className="flex min-h-16 items-center border-b px-6 py-4 lg:px-8">
        <div className="space-y-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3.5 w-72 max-w-full" />
        </div>
      </div>
      <div className="flex-1 px-6 py-6 lg:px-8 lg:py-8">
        <div className="mx-auto w-full max-w-5xl space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-2/3" />
        </div>
      </div>
    </div>
  );
}
