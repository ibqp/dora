import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  /** Optional call to action, e.g. a Button. */
  action?: ReactNode;
  /** `card` renders a bordered panel; `plain` renders without a frame. */
  variant?: "card" | "plain";
  /** `h1` when the empty state is the whole page (no PageHeader), otherwise `h2`. */
  headingLevel?: "h1" | "h2";
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  variant = "card",
  headingLevel: Heading = "h2",
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-12 text-center",
        variant === "card" && "rounded-xl border border-dashed bg-card",
        className,
      )}
    >
      <span className="flex size-11 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <Icon className="size-5" aria-hidden />
      </span>
      <Heading className="mt-4 text-base font-semibold tracking-tight">{title}</Heading>
      {description ? (
        <p className="mt-1.5 max-w-md text-sm text-pretty text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
