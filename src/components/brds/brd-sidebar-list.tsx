"use client";

import { FileText } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Skeleton } from "@/components/ui/skeleton";
import { DOCUMENT_STATUS_LABELS } from "@/lib/brd/generation";
import { cn } from "@/lib/utils";

import { useBrds } from "./brds-provider";

export function BrdSidebarListSkeleton() {
  return (
    <div className="space-y-2 px-2 py-1" role="status" aria-label="Loading BRD documents">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}

export function BrdSidebarList() {
  const { brds, status } = useBrds();
  const pathname = usePathname();

  if (status === "loading" && brds.length === 0) return <BrdSidebarListSkeleton />;
  if (status === "error") {
    return <p className="px-2 py-1.5 text-xs text-muted-foreground">BRD documents could not be loaded.</p>;
  }
  if (brds.length === 0) {
    return (
      <p className="flex items-start gap-2.5 px-2 py-1.5 text-xs leading-relaxed text-muted-foreground">
        <FileText className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>No BRDs yet. Generate one from a discovery session.</span>
      </p>
    );
  }

  return (
    <ul className="space-y-0.5">
      {brds.map((brd) => {
        const href = `/brds/${brd.id}`;
        const active = pathname === href;
        return (
          <li key={brd.id}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              title={`${brd.title} · ${DOCUMENT_STATUS_LABELS[brd.status]}`}
              className={cn(
                "flex items-center gap-2 rounded-lg px-2 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-secondary",
              )}
            >
              <span
                className={cn("size-1.5 shrink-0 rounded-full", brd.status === "READY_FOR_REVIEW" ? "bg-success" : "bg-warning")}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate">{brd.title}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
