/** Text helpers for keyword and pattern matching. Matching is case-insensitive and Unicode-aware. */

export function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function countWords(text: string): number {
  return text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0;
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Regex source for a term: whitespace-flexible, bounded by non-word characters. */
export function termSource(term: string): string {
  const body = term.trim().split(/\s+/).map(escapeRegExp).join("\\s+");
  return `(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`;
}

const termCache = new Map<string, RegExp>();

export function termRegex(term: string): RegExp {
  let regex = termCache.get(term);
  if (!regex) {
    regex = new RegExp(termSource(term), "iu");
    termCache.set(term, regex);
  }
  return regex;
}

export function containsTerm(text: string, term: string): boolean {
  return termRegex(term).test(text);
}

export function containsAnyTerm(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => containsTerm(text, term));
}

export function matchesAnyPattern(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

const NEGATION_WORDS = new Set(["not", "no", "without", "never", "isn't", "isn’t", "aren't", "aren’t", "don't", "don’t", "doesn't", "doesn’t"]);

/** True when one of the three words before `index` is a negation (e.g. "not about churn"). */
export function isNegatedAt(text: string, index: number): boolean {
  const before = text.slice(0, index).toLowerCase().match(/[\p{L}'’]+/gu) ?? [];
  return before.slice(-3).some((word) => NEGATION_WORDS.has(word));
}

/** Positions of all non-overlapping matches of `term` in `text`. */
export function findTermPositions(text: string, term: string): number[] {
  const regex = new RegExp(termSource(term), "giu");
  return [...text.matchAll(regex)].map((match) => match.index);
}

/** Shortens text for quoting in replies, at a word boundary. */
export function excerpt(text: string, maxLength = 120): string {
  const normalized = normalizeText(text);
  if (normalized.length <= maxLength) return normalized;
  const cut = normalized.slice(0, maxLength - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxLength / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Removes trailing punctuation and filler words from an extracted value. */
export function cleanExtractedValue(value: string): string {
  let cleaned = normalizeText(value).replace(/[\s.!?;,:]+$/u, "");
  cleaned = cleaned.replace(/\s+(?:instead|please|rather|now)$/iu, "");
  cleaned = cleaned.replace(/^(?:the|a|an)\s+/iu, "");
  return cleaned.replace(/^["“'‘]+|["”'’]+$/gu, "").trim();
}
