import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Small label above the title, e.g. the section name. */
  eyebrow?: ReactNode;
  /** Buttons or other controls aligned to the right. */
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, eyebrow, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b bg-background px-6 py-4 lg:px-8",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-xs font-medium tracking-wide text-primary uppercase">{eyebrow}</p>
        ) : null}
        <h1 className="truncate text-lg font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="mt-0.5 text-sm text-pretty text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
