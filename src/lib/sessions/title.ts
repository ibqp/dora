export const MAX_SESSION_TITLE_LENGTH = 120;
/** Length of titles derived automatically from the first message. */
export const DERIVED_TITLE_LENGTH = 60;
export const FALLBACK_SESSION_TITLE = "New discovery";

/** Collapses all whitespace (including newlines) into single spaces and trims. */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Deterministic initial title from the first user message: the first sentence (or line),
 * shortened at a word boundary. Purely textual; no interpretation of the content.
 */
export function deriveSessionTitle(firstMessage: string): string {
  const firstLine = firstMessage.split(/\r?\n/).find((line) => line.trim().length > 0) ?? "";
  const sentenceEnd = firstLine.search(/[.!?](\s|$)/);
  const sentence = normalizeWhitespace(sentenceEnd >= 0 ? firstLine.slice(0, sentenceEnd) : firstLine);

  if (!/[\p{L}\p{N}]/u.test(sentence)) return FALLBACK_SESSION_TITLE;
  if (sentence.length <= DERIVED_TITLE_LENGTH) return sentence;

  const cut = sentence.slice(0, DERIVED_TITLE_LENGTH - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const shortened = lastSpace >= DERIVED_TITLE_LENGTH / 2 ? cut.slice(0, lastSpace) : cut;
  return `${shortened.replace(/[\s,;:–-]+$/, "")}…`;
}
