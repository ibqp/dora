/**
 * BRD generation from structured requirements (MASTER_SPEC.md §6). Pure functions.
 *
 * The BRD is built from the requirement fields only — never from the chat transcript — and a
 * value is taken over only when its field is PROVIDED. Missing, skipped and unclear fields stay
 * empty (null) and are shown as "Not specified"; nothing is filled in or invented.
 */
import { DocumentStatus } from "@/generated/prisma/enums";
import {
  BRD_SECTIONS,
  FieldStatus,
  REQUIREMENT_FIELD_KEYS,
  REQUIREMENT_FIELDS,
  type BrdSectionKey,
  type RequirementFieldKey,
} from "@/lib/requirements/fields";
import { calculateCompleteness } from "@/lib/requirements/progress";
import type { BrdContent, BrdManualEdits, RequirementFields } from "@/lib/requirements/schemas";

export const NOT_SPECIFIED = "Not specified";
export const MAX_BRD_TITLE_LENGTH = 200;
/** Upper bound for one manually edited field. */
export const MAX_BRD_FIELD_LENGTH = 4000;

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  DRAFT: "Draft",
  READY_FOR_REVIEW: "Ready for Review",
};

const FIELD_LABELS = Object.fromEntries(REQUIREMENT_FIELDS.map((field) => [field.key, field.label])) as Record<
  RequirementFieldKey,
  string
>;

/** BRD content from the requirement fields: provided values only, everything else null. */
export function generateBrdContent(fields: RequirementFields): BrdContent {
  return Object.fromEntries(
    REQUIREMENT_FIELD_KEYS.map((key) => {
      const field = fields[key];
      const value = field.status === FieldStatus.PROVIDED && field.value?.trim() ? field.value.trim() : null;
      return [key, value];
    }),
  ) as BrdContent;
}

export function countSpecifiedFields(content: BrdContent): number {
  return REQUIREMENT_FIELD_KEYS.filter((key) => content[key] !== null).length;
}

export function calculateBrdCompleteness(content: BrdContent): number {
  return calculateCompleteness(countSpecifiedFields(content));
}

/** READY_FOR_REVIEW only when every required field has content; it is not a business approval. */
export function determineBrdStatus(content: BrdContent): DocumentStatus {
  return countSpecifiedFields(content) === REQUIREMENT_FIELD_KEYS.length
    ? DocumentStatus.READY_FOR_REVIEW
    : DocumentStatus.DRAFT;
}

export function buildBrdTitle(sessionTitle: string): string {
  const title = `BRD: ${sessionTitle.trim() || "Discovery session"}`;
  return title.length <= MAX_BRD_TITLE_LENGTH ? title : `${title.slice(0, MAX_BRD_TITLE_LENGTH - 1).trimEnd()}…`;
}

const MAX_PDF_FILE_NAME_LENGTH = 100;

/**
 * Download file name for a BRD's PDF, derived from its title: "BRD Churn analysis.pdf".
 * Characters that are unsafe in file names are removed; letters of any script are kept.
 */
export function buildBrdPdfFileName(title: string): string {
  const base = title
    .replace(/[^\p{L}\p{N} ._-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_PDF_FILE_NAME_LENGTH)
    .replace(/^[\s.]+|[\s.]+$/g, "");
  return `${base || "BRD"}.pdf`;
}

export interface MissingRequirement {
  key: RequirementFieldKey;
  label: string;
  status: FieldStatus;
}

/** Required fields that would be "Not specified" in a BRD generated now, in BRD order. */
export function listMissingRequirements(fields: RequirementFields): MissingRequirement[] {
  return REQUIREMENT_FIELD_KEYS.filter((key) => fields[key].status !== FieldStatus.PROVIDED).map((key) => ({
    key,
    label: FIELD_LABELS[key],
    status: fields[key].status,
  }));
}

export interface BrdFieldView {
  key: RequirementFieldKey;
  label: string;
  /** Null means "Not specified". */
  value: string | null;
  manuallyEdited: boolean;
}

export interface BrdSectionView {
  key: BrdSectionKey;
  title: string;
  fields: BrdFieldView[];
}

/** The seven BRD sections with their fields, in document order. */
export function buildBrdSections(content: BrdContent, manualEdits: BrdManualEdits): BrdSectionView[] {
  return BRD_SECTIONS.map((section) => ({
    key: section.key,
    title: section.title,
    fields: section.fields.map(({ key, label }) => ({
      key,
      label,
      value: content[key],
      manuallyEdited: manualEdits[key] !== undefined,
    })),
  }));
}
