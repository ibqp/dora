import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface PageContentProps {
  children: ReactNode;
  /** Constrain content to a readable width (default) or let it use the full main column. */
  width?: "default" | "narrow" | "full";
  className?: string;
}

const WIDTH_CLASSES = {
  default: "max-w-5xl",
  narrow: "max-w-3xl",
  full: "max-w-none",
} as const;

export function PageContent({ children, width = "default", className }: PageContentProps) {
  return (
    <div className="flex-1 px-6 py-6 lg:px-8 lg:py-8">
      <div className={cn("mx-auto w-full min-w-0", WIDTH_CLASSES[width], className)}>{children}</div>
    </div>
  );
}
