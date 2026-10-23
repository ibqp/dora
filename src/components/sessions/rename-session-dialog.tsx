"use client";

import { LoaderCircle } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/api/client";
import { MAX_SESSION_TITLE_LENGTH, normalizeWhitespace } from "@/lib/sessions/title";

interface RenameSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTitle: string;
  onRename: (title: string) => Promise<void>;
}

export function RenameSessionDialog({ open, onOpenChange, currentTitle, onRename }: RenameSessionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Remount the form for every opening so it starts from the current title. */}
        {open ? <RenameForm currentTitle={currentTitle} onRename={onRename} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function RenameForm({
  currentTitle,
  onRename,
  onDone,
}: {
  currentTitle: string;
  onRename: (title: string) => Promise<void>;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(currentTitle);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalized = normalizeWhitespace(title);
  const validationError =
    normalized.length === 0
      ? "Please enter a title."
      : normalized.length > MAX_SESSION_TITLE_LENGTH
        ? `The title can be at most ${MAX_SESSION_TITLE_LENGTH} characters.`
        : null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (validationError || pending) return;
    if (normalized === currentTitle) return onDone();
    setPending(true);
    setError(null);
    try {
      await onRename(normalized);
      onDone();
    } catch (caught) {
      setError(errorMessage(caught));
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Rename discovery session</DialogTitle>
        <DialogDescription>The title is shown in the sidebar and in the chat header.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor="session-title">Title</Label>
        <Input
          id="session-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={MAX_SESSION_TITLE_LENGTH + 20}
          aria-invalid={validationError ? true : undefined}
          autoFocus
          onFocus={(event) => event.currentTarget.select()}
        />
        {validationError && title !== currentTitle ? <p className="text-xs text-destructive">{validationError}</p> : null}
        {error ? (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={Boolean(validationError) || pending}>
          {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}
