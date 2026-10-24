/** Persistence for Business Requirements Documents (exactly one per discovery session). */
import type { Prisma } from "@/generated/prisma/client";
import type { UpdateBrdRequest } from "@/lib/api/chat-schemas";
import type { BrdDetail, BrdSummary, RegenerateBrdResponse } from "@/lib/api/types";
import { applyBrdEdits, regenerateBrdContent } from "@/lib/brd/editing";
import {
  buildBrdSections,
  buildBrdTitle,
  calculateBrdCompleteness,
  determineBrdStatus,
  generateBrdContent,
  listMissingRequirements,
} from "@/lib/brd/generation";
import { FieldStatus, REQUIREMENT_FIELDS } from "@/lib/requirements/fields";
import {
  brdContentSchema,
  brdManualEditsSchema,
  requirementFieldsSchema,
  type BrdContent,
  type BrdManualEdits,
} from "@/lib/requirements/schemas";
import { getPrisma, type DbClient, type PrismaClient } from "@/server/db/client";
import { hasPrismaErrorCode, PrismaErrorCode } from "@/server/db/errors";
import { DataIntegrityError, IncompleteRequirementsError, NotFoundError } from "@/server/errors";

const brdSummarySelect = {
  id: true,
  title: true,
  status: true,
  completenessPercentage: true,
  sessionId: true,
  createdAt: true,
  updatedAt: true,
  session: { select: { title: true } },
} satisfies Prisma.BusinessRequirementsDocumentSelect;

const brdDetailSelect = {
  ...brdSummarySelect,
  content: true,
  manualEdits: true,
} satisfies Prisma.BusinessRequirementsDocumentSelect;

type BrdSummaryRow = Prisma.BusinessRequirementsDocumentGetPayload<{ select: typeof brdSummarySelect }>;
type BrdDetailRow = Prisma.BusinessRequirementsDocumentGetPayload<{ select: typeof brdDetailSelect }>;

function toBrdSummary(row: BrdSummaryRow): BrdSummary {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    completenessPercentage: row.completenessPercentage,
    sessionId: row.sessionId,
    sessionTitle: row.session.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function parseStoredBrd(row: BrdDetailRow): { content: BrdContent; manualEdits: BrdManualEdits } {
  const content = brdContentSchema.safeParse(row.content);
  const manualEdits = brdManualEditsSchema.safeParse(row.manualEdits);
  if (!content.success || !manualEdits.success) {
    throw new DataIntegrityError(`Stored content of BRD ${row.id} is invalid`);
  }
  return { content: content.data, manualEdits: manualEdits.data };
}

function toBrdDetail(row: BrdDetailRow): BrdDetail {
  const { content, manualEdits } = parseStoredBrd(row);
  return {
    ...toBrdSummary(row),
    sections: buildBrdSections(content, manualEdits),
    missingFields: REQUIREMENT_FIELDS.filter((field) => content[field.key] === null).map((field) => ({
      key: field.key,
      label: field.label,
      status: FieldStatus.MISSING,
    })),
  };
}

export async function listBrds(db: DbClient = getPrisma()): Promise<BrdSummary[]> {
  const rows = await db.businessRequirementsDocument.findMany({
    select: brdSummarySelect,
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
  });
  return rows.map(toBrdSummary);
}

export async function getBrdDetail(brdId: string, db: DbClient = getPrisma()): Promise<BrdDetail> {
  const row = await db.businessRequirementsDocument.findUnique({ where: { id: brdId }, select: brdDetailSelect });
  if (!row) throw new NotFoundError("BRD");
  return toBrdDetail(row);
}

async function findBrdForSession(sessionId: string, db: DbClient): Promise<BrdDetail | null> {
  const row = await db.businessRequirementsDocument.findUnique({ where: { sessionId }, select: brdDetailSelect });
  return row ? toBrdDetail(row) : null;
}

/**
 * Generates the session's BRD from its structured requirements. If the session already has a
 * BRD, that BRD is returned unchanged (`created: false`) — a session never gets a second one,
 * also not under concurrent requests (unique sessionId). With missing fields, generation
 * requires `allowIncomplete`; the result is then a Draft with those fields not specified.
 */
export async function generateBrdForSession(
  sessionId: string,
  options: { allowIncomplete: boolean },
  db: PrismaClient = getPrisma(),
): Promise<{ brd: BrdDetail; created: boolean }> {
  const existing = await findBrdForSession(sessionId, db);
  if (existing) return { brd: existing, created: false };

  try {
    const brd = await db.$transaction(async (tx) => {
      const session = await tx.chatSession.findUnique({
        where: { id: sessionId },
        select: { title: true, requirementState: { select: { fields: true } } },
      });
      if (!session) throw new NotFoundError("Session");
      const fields = requirementFieldsSchema.safeParse(session.requirementState?.fields);
      if (!fields.success) throw new DataIntegrityError(`Stored requirement state of session ${sessionId} is invalid`);

      const missing = listMissingRequirements(fields.data);
      if (missing.length > 0 && !options.allowIncomplete) throw new IncompleteRequirementsError(missing);

      const content = generateBrdContent(fields.data);
      const row = await tx.businessRequirementsDocument.create({
        data: {
          sessionId,
          title: buildBrdTitle(session.title),
          status: determineBrdStatus(content),
          content,
          manualEdits: {},
          completenessPercentage: calculateBrdCompleteness(content),
        },
        select: brdDetailSelect,
      });
      return toBrdDetail(row);
    });
    return { brd, created: true };
  } catch (error) {
    if (hasPrismaErrorCode(error, PrismaErrorCode.UniqueConstraintViolation)) {
      const concurrent = await findBrdForSession(sessionId, db);
      if (concurrent) return { brd: concurrent, created: false };
    }
    if (hasPrismaErrorCode(error, PrismaErrorCode.ForeignKeyViolation)) throw new NotFoundError("Session");
    throw error;
  }
}

/**
 * Loads a BRD and locks its row until the transaction ends, so that concurrent saves and
 * regenerations are applied one after another instead of overwriting each other.
 */
async function lockBrd(tx: DbClient, brdId: string): Promise<BrdDetailRow> {
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "BusinessRequirementsDocument" WHERE "id" = ${brdId} FOR UPDATE`;
  if (locked.length === 0) throw new NotFoundError("BRD");
  return tx.businessRequirementsDocument.findUniqueOrThrow({ where: { id: brdId }, select: brdDetailSelect });
}

/** Content-derived fields stored with the BRD: status and completeness of the effective content. */
function contentData(content: BrdContent, manualEdits: BrdManualEdits) {
  return {
    content,
    manualEdits,
    status: determineBrdStatus(content),
    completenessPercentage: calculateBrdCompleteness(content),
  };
}

/**
 * Saves manual edits. Fields whose value changes are marked as manually edited; cleared fields
 * are stored as null. Status and completeness are recalculated from the saved content. A save
 * without any effective change leaves the BRD (including `updatedAt`) untouched.
 */
export async function updateBrd(
  brdId: string,
  update: UpdateBrdRequest,
  db: PrismaClient = getPrisma(),
  now: Date = new Date(),
): Promise<BrdDetail> {
  return db.$transaction(async (tx) => {
    const row = await lockBrd(tx, brdId);
    const stored = parseStoredBrd(row);
    const edited = applyBrdEdits(stored.content, stored.manualEdits, update.content ?? {}, now);
    const titleChanged = update.title !== undefined && update.title !== row.title;
    if (edited.changedFields.length === 0 && !titleChanged) return toBrdDetail(row);

    const updated = await tx.businessRequirementsDocument.update({
      where: { id: brdId },
      data: {
        ...(titleChanged ? { title: update.title } : {}),
        ...contentData(edited.content, edited.manualEdits),
      },
      select: brdDetailSelect,
    });
    return toBrdDetail(updated);
  });
}

/**
 * Regenerates the BRD from the session's latest structured requirements. The BRD keeps its
 * identity and title; fields with content (manual edits included) are preserved and only empty
 * fields are filled. Status and completeness are recalculated from the resulting content.
 */
export async function regenerateBrd(brdId: string, db: PrismaClient = getPrisma()): Promise<RegenerateBrdResponse> {
  return db.$transaction(async (tx) => {
    const row = await lockBrd(tx, brdId);
    const stored = parseStoredBrd(row);
    const state = await tx.requirementState.findUnique({ where: { sessionId: row.sessionId }, select: { fields: true } });
    const fields = requirementFieldsSchema.safeParse(state?.fields);
    if (!fields.success) throw new DataIntegrityError(`Stored requirement state of session ${row.sessionId} is invalid`);

    const regenerated = regenerateBrdContent(stored.content, stored.manualEdits, fields.data);
    const data = contentData(regenerated.content, regenerated.manualEdits);
    const unchanged =
      regenerated.changedFields.length === 0 &&
      data.status === row.status &&
      data.completenessPercentage === row.completenessPercentage;
    const result = unchanged
      ? row
      : await tx.businessRequirementsDocument.update({ where: { id: brdId }, data, select: brdDetailSelect });

    const labels = new Map(REQUIREMENT_FIELDS.map((field) => [field.key, field.label]));
    return {
      brd: toBrdDetail(result),
      filledFields: regenerated.changedFields.map((key) => ({ key, label: labels.get(key) ?? key })),
    };
  });
}
