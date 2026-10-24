/**
 * Manual BRD editing and regeneration (MASTER_SPEC.md §6). Pure functions.
 *
 * - A saved field whose value differs from the stored one is marked as manually edited.
 *   Saving an empty value stores null ("Not specified").
 * - Regeneration keeps every field that has content (manual edits and earlier generated text)
 *   and fills only empty fields whose requirement is PROVIDED in the latest discovery state.
 *   A filled field counts as generated content again.
 */
import { REQUIREMENT_FIELD_KEYS, type RequirementFieldKey } from "@/lib/requirements/fields";
import type { BrdContent, BrdManualEdits, RequirementFields } from "@/lib/requirements/schemas";

import { generateBrdContent } from "./generation";

export type BrdContentEdits = Partial<Record<RequirementFieldKey, string | null>>;

export interface BrdContentChange {
  content: BrdContent;
  manualEdits: BrdManualEdits;
  /** Changed fields, in document order. */
  changedFields: RequirementFieldKey[];
}

/** Normalizes an edited value: line endings unified, surrounding whitespace removed, empty → null. */
export function normalizeBrdFieldValue(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  return normalized.length > 0 ? normalized : null;
}

/** Applies user edits; only fields whose value actually changes are marked as manually edited. */
export function applyBrdEdits(
  content: BrdContent,
  manualEdits: BrdManualEdits,
  edits: BrdContentEdits,
  editedAt: Date,
): BrdContentChange {
  const nextContent: BrdContent = { ...content };
  const nextManualEdits: BrdManualEdits = { ...manualEdits };
  const changedFields: RequirementFieldKey[] = [];

  for (const key of REQUIREMENT_FIELD_KEYS) {
    const edit = edits[key];
    if (edit === undefined) continue;
    const value = normalizeBrdFieldValue(edit);
    if (value === content[key]) continue;
    nextContent[key] = value;
    nextManualEdits[key] = { editedAt: editedAt.toISOString() };
    changedFields.push(key);
  }
  return { content: nextContent, manualEdits: nextManualEdits, changedFields };
}

/** Fills empty fields from the latest requirements; fields with content are never changed. */
export function regenerateBrdContent(
  content: BrdContent,
  manualEdits: BrdManualEdits,
  fields: RequirementFields,
): BrdContentChange {
  const generated = generateBrdContent(fields);
  const nextContent: BrdContent = { ...content };
  const nextManualEdits: BrdManualEdits = { ...manualEdits };
  const changedFields: RequirementFieldKey[] = [];

  for (const key of REQUIREMENT_FIELD_KEYS) {
    const value = generated[key];
    if (content[key] !== null || value === null) continue;
    nextContent[key] = value;
    // A field the user had cleared now holds generated text, not a manual edit.
    delete nextManualEdits[key];
    changedFields.push(key);
  }
  return { content: nextContent, manualEdits: nextManualEdits, changedFields };
}
