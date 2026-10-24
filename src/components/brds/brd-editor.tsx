"use client";

import { ArrowLeft, CircleAlert, CircleCheck, Download, LoaderCircle, PencilLine, RefreshCw, Save, Undo2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PageContent } from "@/components/common/page-content";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { brdApi, errorMessage } from "@/lib/api/client";
import type { BrdDetail, BrdFieldView, RegenerateBrdResponse } from "@/lib/api/types";
import { normalizeBrdFieldValue } from "@/lib/brd/editing";
import { buildBrdPdfFileName, MAX_BRD_FIELD_LENGTH, MAX_BRD_TITLE_LENGTH, NOT_SPECIFIED } from "@/lib/brd/generation";
import { formatFullDateTime } from "@/lib/format";
import type { RequirementFieldKey } from "@/lib/requirements/fields";
import { normalizeWhitespace } from "@/lib/sessions/title";
import { cn } from "@/lib/utils";

import { useBrds } from "./brds-provider";
import { BrdStatusBadge } from "./brd-status-badge";

interface Draft {
  title: string;
  values: Record<RequirementFieldKey, string>;
}

function toDraft(brd: BrdDetail): Draft {
  const fields = brd.sections.flatMap((section) => section.fields);
  return {
    title: brd.title,
    values: Object.fromEntries(fields.map((field) => [field.key, field.value ?? ""])) as Draft["values"],
  };
}

/** Fields whose edited value differs from the saved one, compared as the server will store them. */
function changedFields(saved: BrdDetail, draft: Draft): RequirementFieldKey[] {
  return saved.sections
    .flatMap((section) => section.fields)
    .filter((field) => normalizeBrdFieldValue(draft.values[field.key]) !== field.value)
    .map((field) => field.key);
}

type Notice = { tone: "success" | "info"; text: string } | null;

function regenerationNotice({ filledFields }: RegenerateBrdResponse): Notice {
  if (filledFields.length === 0) {
    return {
      tone: "info",
      text: "Nothing changed: the discovery session has no provided requirements for the empty fields.",
    };
  }
  return {
    tone: "success",
    text: `Regenerated. ${filledFields.length} empty field${filledFields.length === 1 ? " was" : "s were"} filled from the latest discovery requirements: ${filledFields.map((field) => field.label).join(", ")}.`,
  };
}

/**
 * BRD editor. Edits stay local until Save Changes; only changed fields are sent. Regeneration
 * and PDF export work on the saved document and are therefore only available without unsaved
 * changes.
 */
export function BrdEditor({ brd }: { brd: BrdDetail }) {
  const { upsert } = useBrds();
  const [saved, setSaved] = useState(brd);
  const [draft, setDraft] = useState(() => toDraft(brd));
  const [latestProp, setLatestProp] = useState(brd);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);

  const dirtyFields = changedFields(saved, draft);
  const normalizedTitle = normalizeWhitespace(draft.title);
  const titleChanged = normalizedTitle !== saved.title;
  const dirtyCount = dirtyFields.length + (titleChanged ? 1 : 0);
  const dirty = dirtyCount > 0;
  const titleInvalid = normalizedTitle.length === 0;

  // A newer copy loaded by the page (e.g. when returning to it) replaces the view only if
  // there is nothing unsaved.
  if (brd !== latestProp) {
    setLatestProp(brd);
    if (!dirty) {
      setSaved(brd);
      setDraft(toDraft(brd));
    }
  }

  function apply(next: BrdDetail) {
    setSaved(next);
    setDraft(toDraft(next));
    upsert(next);
  }

  function discard() {
    setDraft(toDraft(saved));
    setActionError(null);
  }

  const guard = useUnsavedChangesGuard(dirty, discard, "this BRD");

  async function save() {
    if (!dirty || titleInvalid || saving) return;
    setSaving(true);
    setActionError(null);
    setNotice(null);
    try {
      const content = Object.fromEntries(dirtyFields.map((key) => [key, draft.values[key]]));
      const next = await brdApi.update(saved.id, {
        ...(titleChanged ? { title: draft.title } : {}),
        ...(dirtyFields.length > 0 ? { content } : {}),
      });
      apply(next);
      setNotice({ tone: "success", text: "Changes saved." });
    } catch (caught) {
      setActionError(`The changes could not be saved. ${errorMessage(caught)}`);
    } finally {
      setSaving(false);
    }
  }

  async function regenerate() {
    // Errors are shown in the confirmation dialog, which stays open.
    const result = await brdApi.regenerate(saved.id);
    apply(result.brd);
    setActionError(null);
    setNotice(regenerationNotice(result));
  }

  async function exportPdf() {
    if (dirty || exporting) return;
    setExporting(true);
    setActionError(null);
    try {
      const blob = await brdApi.pdf(saved.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = buildBrdPdfFileName(saved.title);
      link.click();
      // Give the browser time to start the download before releasing the blob.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (caught) {
      setActionError(`The PDF could not be exported. ${errorMessage(caught)}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <PageHeader
        className="sticky top-0 z-10"
        eyebrow="Business Requirements Document"
        title={saved.title}
        description={
          dirty ? (
            <Badge variant="outline" className="mt-1 border-primary/30 bg-primary/5 text-primary" role="status">
              <PencilLine aria-hidden />
              {dirtyCount} unsaved change{dirtyCount === 1 ? "" : "s"}
            </Badge>
          ) : null
        }
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href={`/discovery/${saved.sessionId}`}>
                <ArrowLeft aria-hidden />
                Back to Discovery
              </Link>
            </Button>
            {dirty ? (
              <Button variant="outline" size="sm" onClick={discard} disabled={saving}>
                <Undo2 aria-hidden />
                Discard
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmRegenerate(true)}
              disabled={dirty || saving}
              title={dirty ? "Save or discard your changes before regenerating" : undefined}
            >
              <RefreshCw aria-hidden />
              Regenerate BRD
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void exportPdf()}
              disabled={dirty || saving || exporting}
              title={dirty ? "Save or discard your changes first — the PDF is created from the saved document" : undefined}
            >
              {exporting ? <LoaderCircle className="animate-spin" aria-hidden /> : <Download aria-hidden />}
              Export PDF
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={!dirty || titleInvalid || saving}>
              {saving ? <LoaderCircle className="animate-spin" aria-hidden /> : <Save aria-hidden />}
              Save Changes
            </Button>
          </>
        }
      />
      <PageContent width="narrow">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl border bg-card p-5 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">Status</dt>
            <dd className="mt-1">
              <BrdStatusBadge status={saved.status} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Completeness</dt>
            <dd className="mt-1 font-medium tabular-nums">{saved.completenessPercentage}%</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Created</dt>
            <dd className="mt-1">{formatFullDateTime(saved.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Updated</dt>
            <dd className="mt-1">{formatFullDateTime(saved.updatedAt)}</dd>
          </div>
          <div className="col-span-full">
            <dt className="text-xs text-muted-foreground">Source discovery session</dt>
            <dd className="mt-1 truncate">
              <Link href={`/discovery/${saved.sessionId}`} className="font-medium text-primary hover:underline">
                {saved.sessionTitle}
              </Link>
            </dd>
          </div>
        </dl>

        {actionError ? (
          <p role="alert" className="mt-4 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {actionError}
          </p>
        ) : null}
        {notice && !dirty ? (
          <p
            role="status"
            className={cn(
              "mt-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm",
              notice.tone === "success" ? "border-success/30 bg-success/5" : "bg-muted/40",
            )}
          >
            <CircleCheck
              className={cn("mt-0.5 size-4 shrink-0", notice.tone === "success" ? "text-success" : "text-muted-foreground")}
              aria-hidden
            />
            <span>{notice.text}</span>
          </p>
        ) : null}
        {saved.missingFields.length > 0 ? (
          <p className="mt-4 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-sm">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <span>
              {saved.missingFields.length} required field{saved.missingFields.length === 1 ? " is" : "s are"} not
              specified, so this BRD is a draft. Status “Ready for Review” requires all required fields — it reflects
              completeness, not business approval.
            </span>
          </p>
        ) : null}

        <form
          className="mt-6 space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="rounded-xl border bg-card p-5">
            <Label htmlFor="brd-title">Document title</Label>
            <Input
              id="brd-title"
              className="mt-2"
              value={draft.title}
              maxLength={MAX_BRD_TITLE_LENGTH}
              aria-invalid={titleInvalid || undefined}
              aria-describedby={titleInvalid ? "brd-title-error" : undefined}
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            />
            {titleInvalid ? (
              <p id="brd-title-error" className="mt-1.5 text-xs text-destructive">
                The title must not be empty.
              </p>
            ) : null}
          </div>

          {saved.sections.map((section, index) => (
            <section key={section.key} aria-labelledby={`section-${section.key}`} className="rounded-xl border bg-card">
              <h2 id={`section-${section.key}`} className="border-b px-5 py-3 text-base font-semibold">
                <span className="mr-2 text-primary">{index + 1}.</span>
                {section.title}
              </h2>
              <div className="divide-y">
                {section.fields.map((field) => (
                  <BrdFieldInput
                    key={field.key}
                    field={field}
                    value={draft.values[field.key]}
                    unsaved={dirtyFields.includes(field.key)}
                    onChange={(value) =>
                      setDraft((current) => ({ ...current, values: { ...current.values, [field.key]: value } }))
                    }
                  />
                ))}
              </div>
            </section>
          ))}
        </form>
      </PageContent>

      <ConfirmDialog
        open={confirmRegenerate}
        onOpenChange={setConfirmRegenerate}
        title="Regenerate this BRD?"
        description={
          <>
            Empty fields are filled from the latest requirements of the discovery session where they have been
            provided. Fields with content — including your manual edits — are kept unchanged. The document keeps its
            title and identity; status and completeness are recalculated.
          </>
        }
        confirmLabel="Regenerate BRD"
        onConfirm={regenerate}
      />
      {guard.dialog}
    </>
  );
}

interface BrdFieldInputProps {
  field: BrdFieldView;
  value: string;
  unsaved: boolean;
  onChange: (value: string) => void;
}

function BrdFieldInput({ field, value, unsaved, onChange }: BrdFieldInputProps) {
  const id = `brd-field-${field.key}`;
  const empty = value.trim().length === 0;
  return (
    <div className="grid gap-2 px-5 py-4 sm:grid-cols-[14rem_1fr] sm:gap-4">
      <div className="min-w-0 space-y-1.5">
        <Label htmlFor={id} className="leading-snug text-muted-foreground">
          {field.label}
        </Label>
        <div className="flex flex-wrap gap-1.5">
          {unsaved ? (
            <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">
              Unsaved
            </Badge>
          ) : null}
          {field.manuallyEdited ? (
            <Badge variant="secondary" title="Edited manually; kept when the BRD is regenerated">
              Manually edited
            </Badge>
          ) : null}
        </div>
      </div>
      <div className="min-w-0">
        <Textarea
          id={id}
          value={value}
          maxLength={MAX_BRD_FIELD_LENGTH}
          placeholder={NOT_SPECIFIED}
          rows={2}
          className={cn("resize-y", empty && "border-warning/40 bg-warning/5 placeholder:text-warning placeholder:italic")}
          aria-describedby={empty ? `${id}-missing` : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
        {empty ? (
          <p id={`${id}-missing`} className="mt-1 flex items-center gap-1 text-xs text-warning">
            <CircleAlert className="size-3" aria-hidden />
            {NOT_SPECIFIED} — counts as missing
          </p>
        ) : null}
      </div>
    </div>
  );
}
