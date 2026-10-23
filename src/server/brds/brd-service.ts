/** Persistence for Business Requirements Documents (exactly one per discovery session). */
import type { Prisma } from "@/generated/prisma/client";
import type { BrdDetail, BrdSummary } from "@/lib/api/types";
import {
  buildBrdSections,
  buildBrdTitle,
  calculateBrdCompleteness,
  determineBrdStatus,
  generateBrdContent,
  listMissingRequirements,
} from "@/lib/brd/generation";
import { FieldStatus, REQUIREMENT_FIELDS } from "@/lib/requirements/fields";
import { brdContentSchema, brdManualEditsSchema, requirementFieldsSchema } from "@/lib/requirements/schemas";
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

function toBrdDetail(row: BrdDetailRow): BrdDetail {
  const content = brdContentSchema.safeParse(row.content);
  const manualEdits = brdManualEditsSchema.safeParse(row.manualEdits);
  if (!content.success || !manualEdits.success) {
    throw new DataIntegrityError(`Stored content of BRD ${row.id} is invalid`);
  }
  return {
    ...toBrdSummary(row),
    sections: buildBrdSections(content.data, manualEdits.data),
    missingFields: REQUIREMENT_FIELDS.filter((field) => content.data[field.key] === null).map((field) => ({
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
