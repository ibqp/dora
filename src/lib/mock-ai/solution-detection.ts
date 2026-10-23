/**
 * XY-problem support: recognizes requests that name a solution (a dashboard, a report …) and
 * answers that describe only a solution instead of a business problem or outcome.
 */
import { PROBLEM_INDICATORS, REQUEST_OPENING, SOLUTION_TERMS } from "./config/fields";
import { containsAnyTerm, countWords, normalizeText, termSource } from "./text";

const SOLUTION_ALTERNATION = [...SOLUTION_TERMS].sort((a, b) => b.length - a.length).map(termSource).join("|");

/** Up to three descriptive words before the solution noun, e.g. "customer churn dashboard". */
const SOLUTION_PHRASE = new RegExp(
  `((?:[\\p{L}\\p{N}-]+\\s+){0,3}?)(${SOLUTION_ALTERNATION})`,
  "iu",
);

const LEADING_FILLER =
  /^(?:(?:i|we)\s+(?:need|want|would like|['’]d like|require)|(?:can|could|would)\s+you\s+(?:build|create|make|give me|provide)|please|build|create|make|give me|provide|set up|develop|a|an|the|new|some|me|us|to|have|get)\s+/iu;

export function mentionsSolution(text: string): boolean {
  return containsAnyTerm(text, SOLUTION_TERMS);
}

/**
 * Extracts the proposed solution phrase from a request ("I need a customer churn dashboard" →
 * "customer churn dashboard"), or null if no solution term is mentioned.
 */
export function detectProposedSolution(text: string): string | null {
  const match = normalizeText(text).match(SOLUTION_PHRASE);
  if (!match) return null;
  let qualifier = (match[1] ?? "").trim();
  // Strip request verbs and articles that the lazy qualifier may have captured.
  for (let previous = ""; previous !== qualifier; ) {
    previous = qualifier;
    qualifier = `${qualifier} `.replace(LEADING_FILLER, "").trim();
  }
  return normalizeText(`${qualifier} ${match[2] ?? ""}`).toLowerCase();
}

/**
 * True when the answer describes a deliverable but no problem: it mentions a solution, contains no
 * problem indicator, and is phrased as a request or is very short ("A churn dashboard.").
 */
export function isSolutionOnly(text: string): boolean {
  const normalized = normalizeText(text);
  if (!mentionsSolution(normalized)) return false;
  if (containsAnyTerm(normalized, PROBLEM_INDICATORS)) return false;
  return REQUEST_OPENING.test(normalized) || countWords(normalized) <= 6;
}
