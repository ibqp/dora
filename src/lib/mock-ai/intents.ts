/** Detection of short conversational intents: skip, confirmation and non-answers. */
import { CONFIRMATION_PATTERNS, NON_ANSWER_PATTERNS, SKIP_PATTERNS } from "./config/intents";
import { normalizeText } from "./text";

/** Lower-cased, whitespace-normalized message without surrounding quotes and trailing punctuation. */
export function toIntentText(message: string): string {
  return normalizeText(message)
    .toLowerCase()
    .replace(/^["“'‘]+|["”'’]+$/gu, "")
    .replace(/[\s.!?,;:]+$/u, "")
    .trim();
}

const matchesWhole = (message: string, patterns: readonly RegExp[]) => {
  const text = toIntentText(message);
  return patterns.some((pattern) => pattern.test(text));
};

export const isSkipRequest = (message: string) => matchesWhole(message, SKIP_PATTERNS);
export const isConfirmation = (message: string) => matchesWhole(message, CONFIRMATION_PATTERNS);
export const isNonAnswer = (message: string) => matchesWhole(message, NON_ANSWER_PATTERNS);
