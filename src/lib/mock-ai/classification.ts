/** Rule-based scenario classification from keyword dictionaries (MASTER_SPEC.md §4). */
import { Scenario } from "@/generated/prisma/enums";

import {
  HIGH_CONFIDENCE_MARGIN,
  HIGH_CONFIDENCE_SCORE,
  MIN_CLASSIFICATION_MARGIN,
  MIN_CLASSIFICATION_SCORE,
  SCENARIO_KEYWORDS,
  type ClassifiableScenario,
  type KeywordRule,
} from "./config/scenarios";
import { findTermPositions, isNegatedAt } from "./text";
import type { ClassificationResult } from "./types";

export type ScenarioDictionary = Record<ClassifiableScenario, readonly KeywordRule[]>;

const CLASSIFIABLE = Object.keys(SCENARIO_KEYWORDS) as ClassifiableScenario[];

function scoreScenario(text: string, rules: readonly KeywordRule[]) {
  let score = 0;
  const matchedTerms: string[] = [];
  for (const rule of rules) {
    const affirmed = findTermPositions(text, rule.term).some((index) => !isNegatedAt(text, index));
    if (affirmed) {
      score += rule.weight;
      matchedTerms.push(rule.term);
    }
  }
  return { score, matchedTerms };
}

/**
 * Scores every scenario and picks the best one if it is both strong enough and clearly ahead of
 * the runner-up; otherwise falls back to GENERIC_ANALYTICS. Ties are never broken arbitrarily.
 */
export function classifyScenario(
  text: string,
  dictionary: ScenarioDictionary = SCENARIO_KEYWORDS,
): ClassificationResult {
  const results = CLASSIFIABLE.map((scenario) => ({ scenario, ...scoreScenario(text, dictionary[scenario]) }));
  const scores = Object.fromEntries(results.map((r) => [r.scenario, r.score])) as ClassificationResult["scores"];

  const ranked = [...results].sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const runnerUp = ranked[1]?.score ?? 0;
  if (!best) return { scenario: Scenario.GENERIC_ANALYTICS, confidence: "LOW", matchedTerms: [], scores };

  const margin = best.score - runnerUp;
  if (best.score < MIN_CLASSIFICATION_SCORE || margin < MIN_CLASSIFICATION_MARGIN) {
    return { scenario: Scenario.GENERIC_ANALYTICS, confidence: "LOW", matchedTerms: [], scores };
  }
  const confidence =
    best.score >= HIGH_CONFIDENCE_SCORE && margin >= HIGH_CONFIDENCE_MARGIN ? "HIGH" : "MEDIUM";
  return { scenario: best.scenario, confidence, matchedTerms: best.matchedTerms, scores };
}
