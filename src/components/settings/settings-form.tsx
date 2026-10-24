"use client";

import { CircleCheck, LoaderCircle, RotateCcw, Save, TriangleAlert, Undo2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { LoadingState } from "@/components/common/loading-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AssistantRole } from "@/generated/prisma/enums";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { errorMessage, settingsApi } from "@/lib/api/client";
import { responseDelaySchema } from "@/lib/api/settings-schemas";
import type { SettingsDto } from "@/lib/api/types";
import { formatFullDateTime } from "@/lib/format";
import { ROLE_PROFILES } from "@/lib/mock-ai/roles";
import {
  DEFAULT_RESPONSE_DELAY_MS,
  MAX_RESPONSE_DELAY_MS,
  MIN_RESPONSE_DELAY_MS,
  RESPONSE_DELAY_STEP_MS,
} from "@/lib/settings/settings";

const ROLES = Object.values(AssistantRole);

type LoadState = { status: "loading" } | { status: "ready"; settings: SettingsDto } | { status: "error"; message: string };

async function fetchSettings(): Promise<LoadState> {
  try {
    return { status: "ready", settings: await settingsApi.get() };
  } catch (caught) {
    return { status: "error", message: errorMessage(caught) };
  }
}

/** Loads the shared settings and shows the form. */
export function SettingsView() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    // Runs again when the page becomes visible (Activity); a failed refresh keeps the form.
    void fetchSettings().then((next) => {
      if (active) setState((current) => (current.status === "ready" && next.status === "error" ? current : next));
    });
    return () => {
      active = false;
    };
  }, []);

  if (state.status === "loading") return <LoadingState label="Loading settings…" />;
  if (state.status === "error") {
    return (
      <EmptyState
        icon={TriangleAlert}
        title="The settings could not be loaded"
        description={state.message}
        action={
          <Button
            variant="outline"
            onClick={() => {
              setState({ status: "loading" });
              void fetchSettings().then(setState);
            }}
          >
            <RotateCcw aria-hidden />
            Try again
          </Button>
        }
      />
    );
  }
  return <SettingsForm settings={state.settings} />;
}

interface Draft {
  role: AssistantRole;
  /** Kept as typed, so the field can be empty while editing. */
  delay: string;
}

const toDraft = (settings: SettingsDto): Draft => ({
  role: settings.defaultAssistantRole,
  delay: String(settings.mockResponseDelayMs),
});

function parseDelay(text: string): { value: number } | { error: string } {
  if (text.trim() === "") return { error: "Enter a delay in milliseconds." };
  const result = responseDelaySchema.safeParse(Number(text));
  return result.success ? { value: result.data } : { error: result.error.issues[0]?.message ?? "Invalid delay" };
}

function SettingsForm({ settings }: { settings: SettingsDto }) {
  const [saved, setSaved] = useState(settings);
  const [draft, setDraft] = useState(() => toDraft(settings));
  const [latestProp, setLatestProp] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  const delay = parseDelay(draft.delay);
  const roleChanged = draft.role !== saved.defaultAssistantRole;
  const delayChanged = !("value" in delay) || delay.value !== saved.mockResponseDelayMs;
  const dirty = roleChanged || delayChanged;

  // Settings loaded again (e.g. after returning to the page) replace the form only without edits.
  if (settings !== latestProp) {
    setLatestProp(settings);
    if (!dirty) {
      setSaved(settings);
      setDraft(toDraft(settings));
    }
  }

  function discard() {
    setDraft(toDraft(saved));
    setError(null);
  }

  const guard = useUnsavedChangesGuard(dirty, discard, "the settings");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!dirty || !("value" in delay) || saving) return;
    setSaving(true);
    setError(null);
    setSavedNotice(false);
    try {
      const next = await settingsApi.update({
        ...(roleChanged ? { defaultAssistantRole: draft.role } : {}),
        ...(delayChanged ? { mockResponseDelayMs: delay.value } : {}),
      });
      setSaved(next);
      setDraft(toDraft(next));
      setSavedNotice(true);
    } catch (caught) {
      setError(`The settings could not be saved. ${errorMessage(caught)}`);
    } finally {
      setSaving(false);
    }
  }

  const delayError = "error" in delay ? delay.error : null;
  const seconds = "value" in delay ? (delay.value / 1000).toLocaleString("en-GB", { maximumFractionDigits: 1 }) : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      <section aria-labelledby="role-heading" className="rounded-xl border bg-card p-5">
        <h2 id="role-heading" className="text-base font-semibold">
          Default assistant role
        </h2>
        <p id="role-help" className="mt-1 text-sm text-muted-foreground">
          The role new discovery sessions start with. It can still be changed in each chat. Existing sessions keep the
          role selected in their own chat.
        </p>
        <Label htmlFor="default-role" className="mt-4">
          Role for new sessions
        </Label>
        <Select value={draft.role} onValueChange={(role) => setDraft((current) => ({ ...current, role: role as AssistantRole }))}>
          <SelectTrigger id="default-role" aria-describedby="role-help" className="mt-2 w-full max-w-md">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" className="w-(--radix-select-trigger-width)">
            {ROLES.map((role) => (
              <SelectItem key={role} value={role} className="items-start py-2">
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate font-medium">{ROLE_PROFILES[role].label}</span>
                  <span className="text-xs text-muted-foreground in-data-[slot=select-value]:hidden">
                    {ROLE_PROFILES[role].summary}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      <section aria-labelledby="delay-heading" className="rounded-xl border bg-card p-5">
        <h2 id="delay-heading" className="text-base font-semibold">
          Simulated response delay
        </h2>
        <p id="delay-help" className="mt-1 text-sm text-muted-foreground">
          How long “DORA is typing…” is shown before each reply. Applies from the next reply in every session. Allowed:{" "}
          {MIN_RESPONSE_DELAY_MS}–{MAX_RESPONSE_DELAY_MS} ms; default {DEFAULT_RESPONSE_DELAY_MS} ms.
        </p>
        <Label htmlFor="response-delay" className="mt-4">
          Delay in milliseconds
        </Label>
        <div className="mt-2 flex items-center gap-3">
          <Input
            id="response-delay"
            type="number"
            inputMode="numeric"
            min={MIN_RESPONSE_DELAY_MS}
            max={MAX_RESPONSE_DELAY_MS}
            step={RESPONSE_DELAY_STEP_MS}
            value={draft.delay}
            onChange={(event) => setDraft((current) => ({ ...current, delay: event.target.value }))}
            aria-invalid={delayError ? true : undefined}
            aria-describedby={delayError ? "delay-help delay-error" : "delay-help"}
            className="w-36 tabular-nums"
          />
          <span className="text-sm text-muted-foreground">ms{seconds !== null ? ` (${seconds} s)` : ""}</span>
        </div>
        {delayError ? (
          <p id="delay-error" className="mt-1.5 text-xs text-destructive">
            {delayError}
          </p>
        ) : null}
      </section>

      <p className="text-sm text-muted-foreground">
        DORA is a rule-based assistant: there are no model, temperature or prompt settings. These settings are shared by
        everyone using this demo.
      </p>

      {error ? (
        <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t pt-5">
        <Button type="submit" disabled={!dirty || delayError !== null || saving}>
          {saving ? <LoaderCircle className="animate-spin" aria-hidden /> : <Save aria-hidden />}
          Save Changes
        </Button>
        {dirty ? (
          <Button type="button" variant="outline" onClick={discard} disabled={saving}>
            <Undo2 aria-hidden />
            Discard
          </Button>
        ) : null}
        <p role="status" className="text-sm text-muted-foreground">
          {dirty ? (
            "Unsaved changes"
          ) : savedNotice ? (
            <span className="inline-flex items-center gap-1.5 text-success">
              <CircleCheck className="size-4" aria-hidden />
              Settings saved.
            </span>
          ) : (
            `Last changed ${formatFullDateTime(saved.updatedAt)}`
          )}
        </p>
      </div>
      {guard.dialog}
    </form>
  );
}
