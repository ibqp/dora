/** Test helper: extracts text (with positions) from a PDF using pdf.js. */
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export interface PdfTextItem {
  text: string;
  /** Baseline, measured from the bottom edge of the page (PDF user space). */
  y: number;
}

export interface PdfPage {
  height: number;
  items: PdfTextItem[];
  text: string;
}

export interface ParsedPdf {
  pages: PdfPage[];
  text: string;
  info: Record<string, unknown>;
}

export async function parsePdf(data: Uint8Array): Promise<ParsedPdf> {
  const task = getDocument({ data: new Uint8Array(data), useSystemFonts: false });
  const pdf = await task.promise;
  const pages: PdfPage[] = [];
  for (let number = 1; number <= pdf.numPages; number += 1) {
    const page = await pdf.getPage(number);
    const content = await page.getTextContent();
    const items = content.items.flatMap((item) =>
      "str" in item && item.str.trim() ? [{ text: item.str, y: item.transform[5] as number }] : [],
    );
    pages.push({ height: page.view[3] ?? 0, items, text: items.map((item) => item.text).join(" ") });
  }
  const { info } = await pdf.getMetadata();
  await task.destroy();
  return { pages, text: pages.map((page) => page.text).join("\n"), info: info as Record<string, unknown> };
}
