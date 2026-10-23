import { PanelRight } from "lucide-react";
import type { ReactNode } from "react";

import type { DiscoveryStage } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ASSISTANT_NAME } from "@/config/app";
import { DISCOVERY_STAGE_LABELS, DISCOVERY_STAGE_ORDER } from "@/lib/mock-ai/state-machine";

interface ChatHeaderProps {
  title: string;
  stage: DiscoveryStage;
  completenessPercentage: number;
  /** Assistant role dropdown. */
  roleControl: ReactNode;
  /** Generate BRD / Open BRD action. */
  brdAction: ReactNode;
  progressOpen: boolean;
  onToggleProgress: () => void;
}

export function ChatHeader({
  title,
  stage,
  completenessPercentage,
  roleControl,
  brdAction,
  progressOpen,
  onToggleProgress,
}: ChatHeaderProps) {
  const stageNumber = DISCOVERY_STAGE_ORDER.indexOf(stage) + 1;
  return (
    <header className="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b bg-background px-6 py-3 lg:px-8">
      <div className="min-w-0 flex-1 basis-48">
        <p className="text-xs font-medium tracking-wide text-primary uppercase">{ASSISTANT_NAME}</p>
        <h1 className="truncate text-lg font-semibold tracking-tight" title={title}>
          {title}
        </h1>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {roleControl}
        <Badge variant="secondary" title={`Discovery stage ${stageNumber} of ${DISCOVERY_STAGE_ORDER.length}`}>
          {stageNumber}/{DISCOVERY_STAGE_ORDER.length} · {DISCOVERY_STAGE_LABELS[stage]}
        </Badge>
        <Button
          variant={progressOpen ? "secondary" : "outline"}
          size="sm"
          onClick={onToggleProgress}
          aria-pressed={progressOpen}
          aria-label={`${progressOpen ? "Hide" : "Show"} discovery progress (${completenessPercentage}% complete)`}
        >
          <PanelRight aria-hidden />
          <span className="tabular-nums">{completenessPercentage}%</span>
        </Button>
        {brdAction}
      </div>
    </header>
  );
}
