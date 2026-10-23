/**
 * Requirements extraction with explicit rules:
 * - evaluateAnswer: is a reply to the expected field specific enough to record?
 * - extractStatements: explicit "<field> is <value>" statements using unambiguous field names.
 * - detectCorrection: explicit corrections ("Change the KPI to …", "The data source is not CRM; it is …").
 * Values are always the user's own words; nothing is inferred or invented.
 */
import { REQUIREMENT_FIELD_KEYS, type RequirementFieldKey } from "@/lib/requirements/fields";

import { FIELD_RULES } from "./config/fields";
import { CORRECTION_CUE, UNCERTAIN_OPENING } from "./config/intents";
import { isNonAnswer, toIntentText } from "./intents";
import { isSolutionOnly } from "./solution-detection";
import { cleanExtractedValue, containsAnyTerm, countWords, matchesAnyPattern, normalizeText, termSource } from "./text";
import type { UnclearReason } from "./types";

export type AnswerEvaluation = { kind: "clear"; value: string } | { kind: "unclear"; reason: UnclearReason };

export function evaluateAnswer(field: RequirementFieldKey, message: string): AnswerEvaluation {
  const text = normalizeText(message);
  if (isNonAnswer(text) || countWords(text) === 0) return { kind: "unclear", reason: "NON_ANSWER" };

  const rule = FIELD_RULES[field];
  if (rule.rejectSolutionOnly && isSolutionOnly(text)) {
    return {
      kind: "unclear",
      reason: rule.rejectSolutionOnly === "PROBLEM" ? "SOLUTION_NOT_PROBLEM" : "SOLUTION_NOT_OUTCOME",
    };
  }

  const words = countWords(text);
  if (words < rule.minWords) return { kind: "unclear", reason: "TOO_VAGUE" };

  const hasEvidence = containsAnyTerm(text, rule.keywords) || matchesAnyPattern(text, rule.patterns);
  if (hasEvidence) return { kind: "clear", value: text };

  const uncertain = UNCERTAIN_OPENING.test(toIntentText(text));
  if (uncertain) return { kind: "unclear", reason: "NON_ANSWER" };
  if (rule.fallbackMinWords !== null && words >= rule.fallbackMinWords) return { kind: "clear", value: text };
  return { kind: "unclear", reason: "TOO_VAGUE" };
}

/** Explicitly named values (statements, corrections) only need to be real content. */
export function isUsableExplicitValue(value: string): boolean {
  return countWords(value) > 0 && !isNonAnswer(value) && !/^not\b/iu.test(value);
}

// ─── Field aliases ──────────────────────────────────────────────────────────

function buildAliasIndex(kind: "strong" | "all") {
  const index = new Map<string, RequirementFieldKey>();
  for (const field of REQUIREMENT_FIELD_KEYS) {
    const { strong, weak } = FIELD_RULES[field].aliases;
    for (const alias of kind === "strong" ? strong : [...strong, ...weak]) index.set(alias.toLowerCase(), field);
  }
  // Longest first, so "target users" wins over "target" and "data sources" over "data source".
  const alternation = [...index.keys()].sort((a, b) => b.length - a.length).map(termSource).join("|");
  return { index, alternation };
}

const STRONG = buildAliasIndex("strong");
const ALL = buildAliasIndex("all");

function fieldForAlias(alias: string, index: Map<string, RequirementFieldKey>): RequirementFieldKey | null {
  return index.get(normalizeText(alias).toLowerCase()) ?? null;
}

// ─── Statements ─────────────────────────────────────────────────────────────

export interface ExtractedStatement {
  field: RequirementFieldKey;
  value: string;
  /** Position of the whole statement (including its leading separator) in the normalized message. */
  start: number;
  end: number;
}

const STATEMENT_START = `(?:^|[.;!?]\\s+|,\\s*|\\b(?:and|also)\\s+)(?:the\\s+|our\\s+|my\\s+)?`;
/** A value ends at sentence punctuation or where the next named field starts. */
const VALUE_END = `(?=$|[.;!?]|,?\\s+(?:and|also)\\s+(?:the\\s+|our\\s+|my\\s+)?(?:${STRONG.alternation})|,\\s*(?:the\\s+|our\\s+|my\\s+)?(?:${STRONG.alternation}))`;
const STATEMENT = new RegExp(
  `${STATEMENT_START}(${STRONG.alternation})(?:\\s+(?:is|are|will\\s+be|would\\s+be|should\\s+be)|\\s*[:=])\\s+([^.;!?]+?)${VALUE_END}`,
  "giu",
);

/** "The data source is CRM. The KPI is churn rate." → one statement per named field (first wins). */
export function extractStatements(message: string): ExtractedStatement[] {
  const statements: ExtractedStatement[] = [];
  const text = normalizeText(message);
  for (const match of text.matchAll(STATEMENT)) {
    const field = fieldForAlias(match[1] ?? "", STRONG.index);
    const value = cleanExtractedValue(match[2] ?? "");
    if (!field || !isUsableExplicitValue(value)) continue;
    if (statements.some((statement) => statement.field === field)) continue;
    const end = match.index + match[0].length;
    // Include the statement's own closing punctuation so removing it leaves a clean remainder.
    const closing = /^[.;!?]/u.test(text.slice(end)) ? 1 : 0;
    statements.push({ field, value, start: match.index, end: end + closing });
  }
  return statements;
}

/** The message without the given statements, e.g. the answer part of "Weekly. The KPI is churn rate". */
export function removeStatements(message: string, statements: readonly ExtractedStatement[]): string {
  const text = normalizeText(message);
  let result = "";
  let cursor = 0;
  for (const statement of [...statements].sort((a, b) => a.start - b.start)) {
    result += text.slice(cursor, statement.start);
    cursor = statement.end;
  }
  return normalizeText(result + text.slice(cursor));
}

// ─── Corrections ────────────────────────────────────────────────────────────

export type CorrectionDetection =
  | { kind: "none" }
  | { kind: "correction"; field: RequirementFieldKey; value: string }
  | { kind: "ambiguous"; reason: "NO_FIELD" | "MULTIPLE_FIELDS" | "UNUSABLE_VALUE" }
  /** A correction cue without a field name; ambiguous unless it answers the current field. */
  | { kind: "cue-only" };

const PREFIX = `^(?:(?:actually|correction|sorry|wait|oops|no|in fact|to correct(?:\\s+that)?)[,:!]?\\s+)*(?:please\\s+)?`;
const DETERMINER = `(?:the\\s+|our\\s+|my\\s+)?`;
const NEGATED_VERB = `(?:is\\s+not|isn['’]t|are\\s+not|aren['’]t|was\\s+not|wasn['’]t|were\\s+not|weren['’]t)`;
const REPLACEMENT_LEAD = `(?:but\\s+(?:rather\\s+)?(?:it\\s+is\\s+|it['’]s\\s+|they\\s+are\\s+|they['’]re\\s+)?|it\\s+is\\s+|it['’]s\\s+|they\\s+are\\s+|they['’]re\\s+|instead\\s+(?:it\\s+is\\s+)?)`;

interface CorrectionPattern {
  regex: RegExp;
  index: Map<string, RequirementFieldKey>;
  /** Capture group holding the new value. */
  valueGroup: number;
}

const CORRECTION_PATTERNS: readonly CorrectionPattern[] = [
  // "Change the target users to the retention team"
  {
    regex: new RegExp(`${PREFIX}(?:change|update|set|replace|modify|correct)\\s+${DETERMINER}(${ALL.alternation})\\s+(?:to|with|into|as)\\s+(.+)$`, "iu"),
    index: ALL.index,
    valueGroup: 2,
  },
  // "The data source is not CRM; it is the billing system"
  {
    regex: new RegExp(`${PREFIX}${DETERMINER}(${ALL.alternation})\\s+${NEGATED_VERB}\\s+(.+?)(?:\\s*[;,.—–]\\s*|\\s+-\\s+|\\s+)${REPLACEMENT_LEAD}(.+)$`, "iu"),
    index: ALL.index,
    valueGroup: 3,
  },
  // "Actually, the KPI should be churn rate"
  {
    regex: new RegExp(`^(?:actually|correction|in fact)[,:!]?\\s+${DETERMINER}(${ALL.alternation})\\s+(?:should\\s+(?:rather\\s+)?(?:be|read)|is|are|will\\s+be|must\\s+be|needs\\s+to\\s+be)\\s+(?!able\\b)(.+)$`, "iu"),
    index: ALL.index,
    valueGroup: 2,
  },
  // "The reporting period should be the last 24 months" (unambiguous field names only)
  {
    regex: new RegExp(`${PREFIX}${DETERMINER}(${STRONG.alternation})\\s+(?:should\\s+(?:rather\\s+)?(?:be|read)|needs\\s+to\\s+be|must\\s+be)\\s+(?!able\\b)(.+)$`, "iu"),
    index: STRONG.index,
    valueGroup: 2,
  },
];

/** A second "<field> to/is …" clause inside the value means several fields were named at once. */
const SECOND_CLAUSE = new RegExp(`\\b(?:and|also)\\s+${DETERMINER}(${ALL.alternation})\\s+(?:to|is|are|should)\\b`, "iu");

export function detectCorrection(message: string): CorrectionDetection {
  const text = normalizeText(message);
  for (const pattern of CORRECTION_PATTERNS) {
    const match = text.match(pattern.regex);
    if (!match) continue;
    const field = fieldForAlias(match[1] ?? "", pattern.index);
    if (!field) continue;
    const rawValue = match[pattern.valueGroup] ?? "";
    if (SECOND_CLAUSE.test(rawValue)) return { kind: "ambiguous", reason: "MULTIPLE_FIELDS" };
    const value = cleanExtractedValue(rawValue);
    if (!isUsableExplicitValue(value)) return { kind: "ambiguous", reason: "UNUSABLE_VALUE" };
    return { kind: "correction", field, value };
  }
  return CORRECTION_CUE.test(toIntentText(text)) ? { kind: "cue-only" } : { kind: "none" };
}
