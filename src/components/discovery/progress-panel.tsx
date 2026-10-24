import { CircleAlert, CircleCheck, CircleDashed, CircleDot, CircleMinus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { RequirementFieldProgress, RequirementsProgress, StageProgress } from "@/lib/api/types";
import { FieldStatus } from "@/lib/requirements/fields";
import { cn } from "@/lib/utils";

interface ProgressPanelProps {
  progress: RequirementsProgress;
  onClose: () => void;
}

/** Discovery progress: completeness, the six stages, and the status of every required field. */
export function ProgressPanel({ progress, onClose }: ProgressPanelProps) {
  return (
    <aside
      aria-label="Discovery progress"
      className="flex w-72 shrink-0 flex-col border-l bg-sidebar xl:w-80"
    >
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Discovery progress</h2>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Hide discovery progress">
          <X aria-hidden />
        </Button>
      </div>

      {/* Focusable so the panel can be scrolled with the keyboard; `relative` keeps the
          `sr-only` status labels inside the scroll area. */}
      <div
        tabIndex={0}
        className="relative min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
      >
        <section aria-labelledby="completeness-heading">
          <div className="flex items-baseline justify-between">
            <h3 id="completeness-heading" className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Completeness
            </h3>
            <span className="text-2xl font-semibold tabular-nums">{progress.completenessPercentage}%</span>
          </div>
          <Progress value={progress.completenessPercentage} className="mt-2" aria-label="Requirements completeness" />
          <p className="mt-2 text-xs text-muted-foreground">
            {progress.completedCount} of {progress.totalCount} required fields provided. Missing, skipped and unclear
            fields do not count.
          </p>
        </section>

        <section aria-labelledby="stages-heading">
          <h3 id="stages-heading" className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Discovery stages
          </h3>
          <ol className="space-y-1.5">
            {progress.stages.map((stage, index) => (
              <StageItem key={stage.stage} stage={stage} number={index + 1} />
            ))}
          </ol>
        </section>

        <section aria-labelledby="requirements-heading">
          <h3 id="requirements-heading" className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Requirements
          </h3>
          <div className="space-y-4">
            {progress.sections.map((section) => (
              <div key={section.key}>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <h4 className="text-sm font-medium">{section.title}</h4>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {section.completedCount}/{section.totalCount}
                  </span>
                </div>
                <ul className="space-y-0.5">
                  {section.fields.map((field) => (
                    <FieldItem key={field.key} field={field} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <FieldLegend />
        </section>
      </div>
    </aside>
  );
}

function StageItem({ stage, number }: { stage: StageProgress; number: number }) {
  const status = { completed: "Completed", current: "Current stage", upcoming: "Not started" }[stage.status];
  return (
    <li
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm",
        stage.status === "current" && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
        stage.status === "upcoming" && "text-muted-foreground",
      )}
      aria-current={stage.status === "current" ? "step" : undefined}
    >
      {stage.status === "completed" ? (
        <CircleCheck className="size-4 shrink-0 text-success" aria-hidden />
      ) : stage.status === "current" ? (
        <CircleDot className="size-4 shrink-0 text-primary" aria-hidden />
      ) : (
        <CircleDashed className="size-4 shrink-0" aria-hidden />
      )}
      <span className="min-w-0 flex-1 truncate">
        {number}. {stage.label}
      </span>
      <span className="sr-only">({status})</span>
    </li>
  );
}

const FIELD_STATUS_DISPLAY = {
  PROVIDED: { label: "Provided", icon: CircleCheck, className: "text-success" },
  NEEDS_CLARIFICATION: { label: "Needs clarification", icon: CircleAlert, className: "text-warning" },
  SKIPPED: { label: "Skipped (incomplete)", icon: CircleMinus, className: "text-muted-foreground" },
  MISSING: { label: "Missing", icon: CircleDashed, className: "text-muted-foreground/70" },
} satisfies Record<FieldStatus, { label: string; icon: typeof CircleCheck; className: string }>;

function FieldItem({ field }: { field: RequirementFieldProgress }) {
  const display = FIELD_STATUS_DISPLAY[field.status];
  const Icon = display.icon;
  return (
    <li
      className={cn("flex items-start gap-2 rounded-md px-1.5 py-1", field.isCurrent && "bg-accent")}
      title={field.value ?? undefined}
    >
      <Icon className={cn("mt-0.5 size-3.5 shrink-0", display.className)} aria-hidden />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-xs",
            field.status === FieldStatus.PROVIDED || field.isCurrent ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {field.label}
          <span className="sr-only">: {display.label}</span>
          {field.isCurrent ? (
            <span className="ml-1.5 rounded bg-primary/10 px-1 py-px text-[10px] font-medium text-accent-foreground">
              Asking now
            </span>
          ) : null}
        </p>
        {field.value ? (
          <p className={cn("truncate text-[11px]", field.isCurrent ? "text-foreground/75" : "text-muted-foreground")}>
            {field.value}
          </p>
        ) : null}
      </div>
    </li>
  );
}

function FieldLegend() {
  return (
    <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1 border-t pt-3 text-[11px] text-muted-foreground">
      {(Object.values(FieldStatus) as FieldStatus[]).map((status) => {
        const display = FIELD_STATUS_DISPLAY[status];
        const Icon = display.icon;
        return (
          <li key={status} className="flex items-center gap-1.5">
            <Icon className={cn("size-3 shrink-0", display.className)} aria-hidden />
            {display.label}
          </li>
        );
      })}
    </ul>
  );
}
