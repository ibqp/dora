/**
 * Server-side PDF rendering of a saved BRD (MASTER_SPEC.md §6, PDF Export) with PDFKit.
 *
 * The PDF is drawn from the stored BRD content — manual edits included — never from the browser
 * view. Text flows across pages; a field label is never left alone at the bottom of a page.
 * Fonts: Geist (SIL OFL, vendored in assets/fonts/geist) for Unicode coverage.
 */
import path from "node:path";

import PDFDocument from "pdfkit";

import type { BrdDetail, BrdFieldView } from "@/lib/api/types";
import { DOCUMENT_STATUS_LABELS, NOT_SPECIFIED } from "@/lib/brd/generation";
import { formatUtcDateTime } from "@/lib/format";
import { TOTAL_REQUIRED_FIELDS } from "@/lib/requirements/fields";

const APP_TITLE = "Requirements Discovery Tool";

// Resolved from the project root: `next start` (Railway) and the tests run from there.
const FONT_DIR = path.join(process.cwd(), "assets", "fonts", "geist");
const FONT = {
  regular: path.join(FONT_DIR, "Geist-Regular.ttf"),
  medium: path.join(FONT_DIR, "Geist-Medium.ttf"),
  semibold: path.join(FONT_DIR, "Geist-SemiBold.ttf"),
} as const;

const COLOR = {
  primary: "#E20074",
  text: "#0F172A",
  muted: "#64748B",
  border: "#E2E8F0",
  surface: "#F8FAFC",
  warning: "#B45309",
  warningSurface: "#FFFBEB",
  success: "#15803D",
} as const;

const PAGE_MARGINS = { top: 60, bottom: 72, left: 60, right: 60 };
/** Baseline area of the footer, measured from the bottom edge of the page. */
const FOOTER_OFFSET = 44;
const MISSING_MARKER_HEIGHT = 20;

type Doc = PDFKit.PDFDocument;

function contentWidth(doc: Doc): number {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function bottomLimit(doc: Doc): number {
  return doc.page.height - doc.page.margins.bottom;
}

/** Starts a new page unless `height` points still fit above the bottom margin. */
function ensureSpace(doc: Doc, height: number): void {
  if (doc.y + height > bottomLimit(doc)) doc.addPage();
}

function drawRule(doc: Doc, color: string = COLOR.border, width = 0.75): void {
  const left = doc.page.margins.left;
  doc
    .moveTo(left, doc.y)
    .lineTo(left + contentWidth(doc), doc.y)
    .lineWidth(width)
    .strokeColor(color)
    .stroke();
}

/** Counted from the rendered fields, so the note always matches what the document shows. */
function countMissing(brd: BrdDetail): number {
  return brd.sections.flatMap((section) => section.fields).filter((field) => field.value === null).length;
}

function drawTitleBlock(doc: Doc, brd: BrdDetail): void {
  const left = doc.page.margins.left;
  doc.font(FONT.medium).fontSize(8.5).fillColor(COLOR.primary).text(APP_TITLE.toUpperCase(), left, doc.y, { characterSpacing: 1.2 });
  doc.moveDown(0.2);
  doc.font(FONT.regular).fontSize(10).fillColor(COLOR.muted).text("Business Requirements Document");
  doc.moveDown(0.5);
  doc.font(FONT.semibold).fontSize(20).fillColor(COLOR.text).text(brd.title, { width: contentWidth(doc), lineGap: 2 });
  doc.moveDown(0.5);
  doc.rect(left, doc.y, 40, 2.5).fill(COLOR.primary);
  doc.y += 16;
}

function drawMetadata(doc: Doc, brd: BrdDetail): void {
  const left = doc.page.margins.left;
  const columnWidth = contentWidth(doc) / 2;
  const specified = TOTAL_REQUIRED_FIELDS - countMissing(brd);
  const rows: [string, string, string?][][] = [
    [
      ["Document date", formatUtcDateTime(brd.updatedAt)],
      ["Status", DOCUMENT_STATUS_LABELS[brd.status], brd.status === "READY_FOR_REVIEW" ? COLOR.success : COLOR.warning],
    ],
    [
      ["Created", formatUtcDateTime(brd.createdAt)],
      ["Completeness", `${brd.completenessPercentage}% (${specified} of ${TOTAL_REQUIRED_FIELDS} fields specified)`],
    ],
    [["Source discovery session", brd.sessionTitle]],
  ];

  for (const row of rows) {
    const top = doc.y;
    let bottom = top;
    row.forEach(([label, value, color], index) => {
      const x = left + index * columnWidth;
      const width = row.length === 1 ? contentWidth(doc) : columnWidth - 16;
      doc.font(FONT.regular).fontSize(8.5).fillColor(COLOR.muted).text(label, x, top, { width });
      doc.font(FONT.medium).fontSize(10.5).fillColor(color ?? COLOR.text).text(value, x, doc.y + 2, { width });
      bottom = Math.max(bottom, doc.y);
    });
    doc.y = bottom + 10;
  }
  doc.x = left;
}

function drawCompletenessNote(doc: Doc, brd: BrdDetail): void {
  const left = doc.page.margins.left;
  const missing = countMissing(brd);
  const text =
    missing > 0
      ? `${missing} of ${TOTAL_REQUIRED_FIELDS} required fields are not specified and are marked “${NOT_SPECIFIED}” below. ` +
        "The status reflects requirements completeness, not business approval."
      : `All ${TOTAL_REQUIRED_FIELDS} required fields are specified. The status reflects requirements completeness, not business approval.`;
  const padding = 10;
  const width = contentWidth(doc) - 2 * padding - 3;
  doc.font(FONT.regular).fontSize(9);
  const height = doc.heightOfString(text, { width, lineGap: 1.5 }) + 2 * padding;
  const top = doc.y;
  doc.rect(left, top, contentWidth(doc), height).fill(missing > 0 ? COLOR.warningSurface : COLOR.surface);
  doc.rect(left, top, 3, height).fill(missing > 0 ? COLOR.warning : COLOR.primary);
  doc.fillColor(COLOR.text).text(text, left + 3 + padding, top + padding, { width, lineGap: 1.5 });
  doc.x = left;
  doc.y = top + height + 22;
}

function drawSectionHeading(doc: Doc, index: number, title: string): void {
  const left = doc.page.margins.left;
  // Keep the heading together with the start of its first field.
  ensureSpace(doc, 80);
  doc.outline.addItem(`${index}. ${title}`);
  const top = doc.y;
  doc.font(FONT.semibold).fontSize(13).fillColor(COLOR.primary).text(`${index}.`, left, top, { lineBreak: false });
  doc.fillColor(COLOR.text).text(title, left + 20, top, { width: contentWidth(doc) - 20 });
  doc.x = left;
  doc.y += 4;
  drawRule(doc);
  doc.y += 10;
}

function drawField(doc: Doc, field: BrdFieldView): void {
  const left = doc.page.margins.left;
  const width = contentWidth(doc);
  // Keep the label on the same page as the "Not specified" marker or the first two lines of the value.
  doc.font(FONT.medium).fontSize(9);
  const labelHeight = doc.heightOfString(field.label, { width }) + 3;
  doc.font(FONT.regular).fontSize(10.5);
  const valueStart =
    field.value === null
      ? MISSING_MARKER_HEIGHT
      : Math.min(doc.heightOfString(field.value, { width, lineGap: 2.5 }), 2 * (doc.currentLineHeight(true) + 2.5));
  ensureSpace(doc, labelHeight + valueStart);

  doc.font(FONT.medium).fontSize(9).fillColor(COLOR.muted).text(field.label, left, doc.y, {
    width,
    continued: field.manuallyEdited,
  });
  if (field.manuallyEdited) doc.font(FONT.regular).fontSize(8).text("  ·  Manually edited");
  doc.y += 3;

  if (field.value === null) {
    const top = doc.y;
    doc.rect(left, top, width, MISSING_MARKER_HEIGHT).fill(COLOR.warningSurface);
    doc.rect(left, top, 2, MISSING_MARKER_HEIGHT).fill(COLOR.warning);
    doc.font(FONT.medium).fontSize(10).fillColor(COLOR.warning).text(`${NOT_SPECIFIED} — missing information`, left + 10, top + 4.5, {
      width: width - 20,
      lineBreak: false,
    });
    doc.x = left;
    doc.y = top + MISSING_MARKER_HEIGHT;
  } else {
    // Flows onto following pages automatically when it does not fit.
    doc.font(FONT.regular).fontSize(10.5).fillColor(COLOR.text).text(field.value, left, doc.y, { width, lineGap: 2.5 });
  }
  doc.y += 14;
}

/** Footer on every page: document title and "Page n of N". Drawn after all content exists. */
function drawFooters(doc: Doc, brd: BrdDetail): void {
  const { start, count } = doc.bufferedPageRange();
  for (let index = start; index < start + count; index += 1) {
    doc.switchToPage(index);
    const left = doc.page.margins.left;
    const width = contentWidth(doc);
    const y = doc.page.height - FOOTER_OFFSET;
    // Writing below the bottom margin would otherwise trigger an automatic page break.
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    doc
      .moveTo(left, y - 8)
      .lineTo(left + width, y - 8)
      .lineWidth(0.5)
      .strokeColor(COLOR.border)
      .stroke();
    const title = brd.title.length > 70 ? `${brd.title.slice(0, 69).trimEnd()}…` : brd.title;
    doc.font(FONT.regular).fontSize(8).fillColor(COLOR.muted);
    doc.text(`${APP_TITLE} · ${title}`, left, y, { width: width - 80, lineBreak: false });
    doc.text(`Page ${index - start + 1} of ${count}`, left + width - 80, y, { width: 80, align: "right", lineBreak: false });

    doc.page.margins.bottom = bottomMargin;
  }
}

/** Renders the saved BRD as an A4 PDF. */
export function renderBrdPdf(brd: BrdDetail): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margins: PAGE_MARGINS,
    bufferPages: true,
    font: FONT.regular,
    lang: "en",
    displayTitle: true,
    info: {
      Title: brd.title,
      Subject: "Business Requirements Document",
      Creator: `DORA — ${APP_TITLE}`,
    },
  });

  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  drawTitleBlock(doc, brd);
  drawMetadata(doc, brd);
  drawCompletenessNote(doc, brd);
  brd.sections.forEach((section, index) => {
    drawSectionHeading(doc, index + 1, section.title);
    for (const field of section.fields) drawField(doc, field);
    doc.y += 8;
  });
  drawFooters(doc, brd);
  doc.end();
  return done;
}
