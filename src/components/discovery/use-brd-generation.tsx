"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type MouseEvent } from "react";

import { useBrds } from "@/components/brds/brds-provider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ApiClientError, brdApi, errorMessage } from "@/lib/api/client";
import type { BrdReference, MissingRequirement } from "@/lib/api/types";
import { FieldStatus, REQUIREMENT_FIELDS, TOTAL_REQUIRED_FIELDS } from "@/lib/requirements/fields";

const STATUS_TEXT: Record<FieldStatus, string> = {
  MISSING: "Missing",
  NEEDS_CLARIFICATION: "Needs clarification",
  SKIPPED: "Skipped",
  PROVIDED: "Provided",
};

interface Options {
  sessionId: string | null;
  /** Fields without a provided value, according to the current progress. */
  missing: MissingRequirement[];
  onGenerated: (brd: BrdReference) => void;
}

/**
 * Generate BRD flow: complete requirements generate directly; otherwise a warning lists the
 * missing fields and the user may continue with a draft. The server enforces the same rule.
 */
export function useBrdGeneration({ sessionId, missing, onGenerated }: Options) {
  const router = useRouter();
  const { upsert } = useBrds();
  const [warning, setWarning] = useState<MissingRequirement[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate(allowIncomplete: boolean) {
    if (!sessionId || pending) return;
    setPending(true);
    setError(null);
    try {
      const brd = await brdApi.generate(sessionId, { allowIncomplete });
      upsert(brd);
      onGenerated({ id: brd.id, status: brd.status, updatedAt: brd.updatedAt });
      setWarning(null);
      router.push(`/brds/${brd.id}`);
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.code === "INCOMPLETE_REQUIREMENTS") {
        // The requirements changed since the progress was loaded: show the server's list.
        const labels = new Map(REQUIREMENT_FIELDS.map((field) => [field.key as string, field.label]));
        setWarning(
          caught.issues.map((issue) => ({
            key: issue.path as MissingRequirement["key"],
            label: labels.get(issue.path) ?? issue.path,
            status: FieldStatus.MISSING,
          })),
        );
      } else {
        setError(errorMessage(caught));
      }
    } finally {
      setPending(false);
    }
  }

  function request() {
    if (missing.length > 0) {
      setError(null);
      setWarning(missing);
    } else {
      void generate(false);
    }
  }

  const dialog = (
    <AlertDialog open={warning !== null} onOpenChange={(open) => !open && !pending && setWarning(null)}>
      <AlertDialogContent className="sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Some requirements are not specified</AlertDialogTitle>
          <AlertDialogDescription>
            {warning?.length} of {TOTAL_REQUIRED_FIELDS} required fields are incomplete. You can continue the discovery,
            or generate a draft BRD now — incomplete fields will be shown as “Not specified”.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="max-h-60 space-y-1 overflow-y-auto rounded-lg border bg-muted/40 p-3 text-sm" aria-label="Incomplete fields">
          {warning?.map((field) => (
            <li key={field.key} className="flex items-baseline justify-between gap-3">
              <span>{field.label}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{STATUS_TEXT[field.status]}</span>
            </li>
          ))}
        </ul>
        {error ? (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Continue discovery</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(event: MouseEvent<HTMLButtonElement>) => {
              event.preventDefault();
              void generate(true);
            }}
          >
            {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
            Generate draft BRD
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { request, pending, error: warning === null ? error : null, dialog };
}
