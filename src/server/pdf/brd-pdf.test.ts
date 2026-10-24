import { describe, expect, it } from "vitest";

import type { BrdDetail } from "@/lib/api/types";
import { BRD_SECTIONS, REQUIREMENT_FIELD_KEYS, REQUIREMENT_FIELDS } from "@/lib/requirements/fields";
import { buildBrdSections, calculateBrdCompleteness, determineBrdStatus } from "@/lib/brd/generation";
import { createEmptyBrdContent, type BrdContent, type BrdManualEdits } from "@/lib/requirements/schemas";
import { parsePdf, type ParsedPdf } from "../../../tests/pdf-text";

import { renderBrdPdf } from "./brd-pdf";

/** Text comparison independent of how the PDF splits lines and words. */
const squash = (text: string) => text.replace(/\s+/g, "");

function brdFrom(content: BrdContent, manualEdits: BrdManualEdits = {}, title = "BRD: Customer churn dashboard"): BrdDetail {
  return {
    id: "cmh3x8k2f0000abcd1234efgh",
    title,
    status: determineBrdStatus(content),
    completenessPercentage: calculateBrdCompleteness(content),
    sessionId: "cmh3x8k2f0000abcd1234zzzz",
    sessionTitle: "Customer churn dashboard",
    createdAt: "2026-10-23T10:00:00.000Z",
    updatedAt: "2026-10-23T12:30:00.000Z",
    sections: buildBrdSections(content, manualEdits),
    missingFields: REQUIREMENT_FIELDS.filter((field) => content[field.key] === null).map((field) => ({
      key: field.key,
      label: field.label,
      status: "MISSING" as const,
    })),
  };
}

async function render(brd: BrdDetail): Promise<{ bytes: Buffer; pdf: ParsedPdf }> {
  const bytes = await renderBrdPdf(brd);
  return { bytes, pdf: await parsePdf(bytes) };
}

/** Text of all pages without the footers (which otherwise interrupt content spanning a page break). */
const bodyText = (pdf: ParsedPdf) =>
  squash(pdf.pages.flatMap((page) => page.items.filter((item) => item.y >= 60).map((item) => item.text)).join(""));

/** Body text must stay above the footer; the footer holds only the title line and page number. */
function expectNoClipping(pdf: ParsedPdf) {
  pdf.pages.forEach((page, index) => {
    for (const item of page.items) {
      expect(item.y, `"${item.text}" is outside page ${index + 1}`).toBeGreaterThan(20);
      expect(item.y).toBeLessThan(page.height - 20);
      if (item.y < 60) expect(item.text).toMatch(/^(Page \d+ of \d+|Requirements Discovery Tool · .*)$/);
    }
  });
}

describe("renderBrdPdf", () => {
  it("renders a valid PDF with title, date, status, all sections and marked missing values", async () => {
    const content = createEmptyBrdContent();
    content.problemStatement = "Postpaid churn rose to 1.8% and we cannot see who will leave";
    content.keyMetrics = "Monthly churn rate per segment";
    const { bytes, pdf } = await render(brdFrom(content, { keyMetrics: { editedAt: "2026-10-23T12:30:00.000Z" } }));

    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(bytes.subarray(-6).toString()).toContain("%%EOF");
    expect(pdf.info["Title"]).toBe("BRD: Customer churn dashboard");

    const text = squash(pdf.text);
    for (const expected of [
      "REQUIREMENTS DISCOVERY TOOL",
      "BRD: Customer churn dashboard",
      "Document date23 Oct 2026, 12:30 UTC",
      "StatusDraft",
      "Completeness11% (2 of 18 fields specified)",
      "Source discovery sessionCustomer churn dashboard",
      "16 of 18 required fields are not specified",
      "Postpaid churn rose to 1.8% and we cannot see who will leave",
      "Key business metrics · Manually editedMonthly churn rate per segment",
    ]) {
      expect(text).toContain(squash(expected));
    }
    for (const [index, section] of BRD_SECTIONS.entries()) expect(text).toContain(squash(`${index + 1}. ${section.title}`));
    for (const field of REQUIREMENT_FIELDS) expect(text).toContain(squash(field.label));
    expect(pdf.text.match(/Not specified — missing information/g)).toHaveLength(16);
  });

  it("numbers every page and flows long content across pages without clipping", async () => {
    const content = createEmptyBrdContent();
    for (const key of REQUIREMENT_FIELD_KEYS) {
      content[key] = `${"Long requirement text that wraps over many lines. ".repeat(60)}END-${key}`;
    }
    // A single unbroken 3000-character token must wrap as well.
    content.dataSources = `${"x".repeat(3000)}END-dataSources`;
    const { pdf } = await render(brdFrom(content));

    expect(pdf.pages.length).toBeGreaterThan(10);
    pdf.pages.forEach((page, index) => expect(page.text).toContain(`Page ${index + 1} of ${pdf.pages.length}`));
    const text = bodyText(pdf);
    for (const key of REQUIREMENT_FIELD_KEYS) expect(text).toContain(`END-${key}`);
    expect(text).toContain("x".repeat(3000));
    expect(text).toContain(squash("StatusReady for Review"));
    expect(text).toContain(squash("All 18 required fields are specified"));
    expect(pdf.text).not.toContain("Not specified — missing information");
    expectNoClipping(pdf);
  });

  it("keeps multi-line values and non-ASCII text intact", async () => {
    const content = createEmptyBrdContent();
    content.successCriteria = "First line\nSecond line ≥ 95% — “quoted”, Ünïcödé, Привет";
    const { pdf } = await render(brdFrom(content, {}, "BRD: Ärger mit Kündigungen"));
    expect(squash(pdf.text)).toContain(squash("First line Second line ≥ 95% — “quoted”, Ünïcödé, Привет"));
    expect(squash(pdf.text)).toContain(squash("BRD: Ärger mit Kündigungen"));
    expectNoClipping(pdf);
  });
});
