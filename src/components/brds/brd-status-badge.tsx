import { CircleCheck, FilePen } from "lucide-react";

import type { DocumentStatus } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { DOCUMENT_STATUS_LABELS } from "@/lib/brd/generation";
import { cn } from "@/lib/utils";

export function BrdStatusBadge({ status, className }: { status: DocumentStatus; className?: string }) {
  const ready = status === "READY_FOR_REVIEW";
  return (
    <Badge
      variant="outline"
      className={cn(ready ? "border-success/30 bg-success/10 text-success" : "border-warning/30 bg-warning/10 text-warning", className)}
      title={ready ? "All required fields are complete (not a business approval)" : "Some required fields are not specified"}
    >
      {ready ? <CircleCheck aria-hidden /> : <FilePen aria-hidden />}
      {DOCUMENT_STATUS_LABELS[status]}
    </Badge>
  );
}
