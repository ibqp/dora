import { describe, expect, it } from "vitest";

import { AssistantRole, Scenario } from "@/generated/prisma/enums";
import { FieldStatus, REQUIREMENT_FIELD_KEYS, type RequirementFieldKey } from "@/lib/requirements/fields";
import { calculateRequirementsCompleteness } from "@/lib/requirements/progress";

import { MAX_CLARIFICATION_ATTEMPTS } from "./config/fields";
import { processTurn } from "./engine";
import { evaluateAnswer } from "./extraction";
import { createInitialDiscoveryState, discoveryStateSchema } from "./state";
import { FIELD_EXAMPLES } from "./templates";
import type { DiscoveryState, EngineResult } from "./types";

const ROLES = Object.values(AssistantRole);

function converse(messages: readonly string[], options: { role?: AssistantRole; state?: DiscoveryState } = {}) {
  let state = options.state ?? createInitialDiscoveryState();
  const results: EngineResult[] = [];
  for (const message of messages) {
    const result = processTurn({ message, state, role: options.role ?? "REQUIREMENTS_DISCOVERY" });
    results.push(result);
    state = result.state;
  }
  const last = results.at(-1)!;
  return { results, state, last };
}

/** Answers DORA's current question with the churn example for that field until review. */
function answerUntilReview(state: DiscoveryState, role: AssistantRole = "REQUIREMENTS_DISCOVERY") {
  let current = state;
  for (let turn = 0; turn < 40 && current.currentField; turn++) {
    current = processTurn({ message: FIELD_EXAMPLES[current.currentField].CUSTOMER_CHURN, state: current, role }).state;
  }
  return current;
}

const providedValues = (state: DiscoveryState) =>
  Object.fromEntries(REQUIREMENT_FIELD_KEYS.filter((k) => state.fields[k].status === "PROVIDED").map((k) => [k, state.fields[k].value]));

describe("initial request and mandatory XY-problem validation (Scenario B)", () => {
  it("asks about the underlying business problem for a dashboard request", () => {
    const { last } = converse(["I need a customer churn dashboard."]);

    expect(last.state.scenario).toBe("CUSTOMER_CHURN");
    expect(last.state.stage).toBe("BUSINESS_PROBLEM_VALIDATION");
    expect(last.state.currentField).toBe("problemStatement");
    expect(last.reply).toContain("what business problem are you trying to solve");
    expect(last.reply).toContain("what decision would the information help you make");
    expect(last.state.proposedSolution).toBe("customer churn dashboard");
  });

  it("does not treat the proposed dashboard as the problem, objective or deliverable", () => {
    const { last } = converse(["I need a customer churn dashboard."]);
    for (const key of REQUIREMENT_FIELD_KEYS) expect(last.state.fields[key].status).toBe(FieldStatus.MISSING);
    expect(last.completenessPercentage).toBe(0);
  });

  it.each(
    ROLES.flatMap((role) =>
      [
        "I need a customer churn dashboard",
        "Can you build a sales dashboard?",
        "We need a report on network outages",
        "Please prepare a cost overview for finance",
      ].map((message) => [role, message] as const),
    ),
  )("starts business problem validation for role %s and request %j", (role, message) => {
    const { last } = converse([message], { role });
    expect(last.state.stage).toBe("BUSINESS_PROBLEM_VALIDATION");
    expect(last.state.currentField).toBe("problemStatement");
    expect(last.events).toContainEqual({ type: "QUESTION_ASKED", field: "problemStatement", kind: "INITIAL" });
  });

  it("classifies every supported scenario", () => {
    const scenarios: Record<Scenario, string> = {
      CUSTOMER_CHURN: "We see rising churn and cancellations",
      SALES_PERFORMANCE: "I need a sales dashboard showing revenue",
      NETWORK_PERFORMANCE: "Latency and dropped calls are increasing",
      GENERIC_ANALYTICS: "I need some figures for a meeting",
    };
    for (const [scenario, message] of Object.entries(scenarios)) {
      expect(converse([message]).state.scenario).toBe(scenario);
    }
  });

  it("never takes problem or objective fields from the initial request, but keeps other explicit statements", () => {
    const { state } = converse(["The business problem is rising churn. The data source is CRM."]);
    expect(state.fields.problemStatement.status).toBe(FieldStatus.MISSING);
    expect(state.fields.dataSources).toMatchObject({ status: FieldStatus.PROVIDED, value: "CRM" });
    expect(state.currentField).toBe("problemStatement");
  });

  it("rejects a solution given as the business problem", () => {
    const { last } = converse(["I need a churn dashboard", "A churn dashboard."]);
    expect(last.state.fields.problemStatement.status).toBe(FieldStatus.NEEDS_CLARIFICATION);
    expect(last.events).toContainEqual({ type: "FIELD_NEEDS_CLARIFICATION", field: "problemStatement", reason: "SOLUTION_NOT_PROBLEM" });
    expect(last.reply).toContain("possible solution rather than the business problem");
    expect(last.reply).toContain("For example:");
  });

  it("rejects a deliverable given as the desired outcome", () => {
    const { last } = converse([
      "I need a churn dashboard",
      "Churn rose by 20% and we cannot see which customers leave",
      "A dashboard",
    ]);
    expect(last.state.fields.desiredOutcome.status).toBe(FieldStatus.NEEDS_CLARIFICATION);
    expect(last.reply).toContain("deliverable rather than a business outcome");
  });

  it("brings the proposed solution back only when the deliverable is discussed", () => {
    let result = processTurn({ message: "I need a customer churn dashboard.", state: createInitialDiscoveryState(), role: "REQUIREMENTS_DISCOVERY" });
    while (result.state.currentField && result.state.currentField !== "expectedOutput") {
      expect(result.reply).not.toContain("You initially asked for");
      result = processTurn({ message: FIELD_EXAMPLES[result.state.currentField].CUSTOMER_CHURN, state: result.state, role: "REQUIREMENTS_DISCOVERY" });
    }
    expect(result.state.fields.expectedOutput.status).toBe(FieldStatus.MISSING);
    expect(result.reply).toContain("You initially asked for a customer churn dashboard.");
    expect(result.reply).toContain("still the right deliverable");
  });
});

describe("clarification and skipping", () => {
  it("clarifies an unclear problem at most twice, then skips it", () => {
    const { results, state } = converse(["I need a churn dashboard", "not sure", "no idea", "I don't know"]);

    expect(results[1]!.state.fields.problemStatement).toMatchObject({ status: "NEEDS_CLARIFICATION", clarificationCount: 1 });
    expect(results[2]!.state.fields.problemStatement).toMatchObject({ status: "NEEDS_CLARIFICATION", clarificationCount: 2 });
    expect(state.fields.problemStatement).toMatchObject({ status: "SKIPPED", clarificationCount: MAX_CLARIFICATION_ATTEMPTS });
    expect(results[3]!.events).toContainEqual({ type: "FIELD_SKIPPED", field: "problemStatement", reason: "MAX_CLARIFICATIONS" });
    expect(state.currentField).toBe("desiredOutcome");
  });

  it("includes an example answer and the skip option in clarification questions", () => {
    const { last } = converse(["We need a report on network outages", "hmm"]);
    expect(last.reply).toContain(`For example: “${FIELD_EXAMPLES.problemStatement.NETWORK_PERFORMANCE}”`);
    expect(last.reply).toContain("reply “skip”");
  });

  it("defers unclear discovery answers and revisits them in the clarification stage", () => {
    const opening = converse([
      "I need a churn dashboard",
      FIELD_EXAMPLES.problemStatement.CUSTOMER_CHURN,
      FIELD_EXAMPLES.desiredOutcome.CUSTOMER_CHURN,
    ]);
    expect(opening.state).toMatchObject({ stage: "REQUIREMENTS_DISCOVERY", currentField: "currentSituation" });

    const deferred = processTurn({ message: "not sure", state: opening.state, role: "REQUIREMENTS_DISCOVERY" });
    expect(deferred.state.fields.currentSituation).toMatchObject({ status: "NEEDS_CLARIFICATION", clarificationCount: 0 });
    expect(deferred.state.currentField).toBe("businessImpact");
    expect(deferred.reply).toContain("will come back to it");

    const clarifying = answerUntilReviewOrClarification(deferred.state);
    expect(clarifying).toMatchObject({ stage: "REQUIREMENTS_CLARIFICATION", currentField: "currentSituation" });
    expect(clarifying.fields.currentSituation.clarificationCount).toBe(1);

    const resolved = processTurn({ message: FIELD_EXAMPLES.currentSituation.CUSTOMER_CHURN, state: clarifying, role: "REQUIREMENTS_DISCOVERY" });
    expect(resolved.state.fields.currentSituation.status).toBe("PROVIDED");
    expect(resolved.state.stage).toBe("REQUIREMENTS_REVIEW");
  });

  it("skips a field immediately on request and marks it incomplete", () => {
    const { state, last } = converse(["I need a churn dashboard", "skip"]);
    expect(state.fields.problemStatement.status).toBe("SKIPPED");
    expect(last.events).toContainEqual({ type: "FIELD_SKIPPED", field: "problemStatement", reason: "USER_REQUEST" });
    expect(last.completenessPercentage).toBe(0);
  });

  it("cannot loop forever: unhelpful answers lead to the review stage in bounded turns", () => {
    for (const role of ROLES) {
      let state = converse(["I need a churn dashboard"], { role }).state;
      let turns = 0;
      while (state.stage !== "REQUIREMENTS_REVIEW") {
        state = processTurn({ message: "I don't know", state, role }).state;
        turns += 1;
        expect(turns).toBeLessThanOrEqual(18 * (1 + MAX_CLARIFICATION_ATTEMPTS));
      }
      for (const key of REQUIREMENT_FIELD_KEYS) {
        expect(state.fields[key].status).toBe("SKIPPED");
        expect(state.fields[key].clarificationCount).toBeLessThanOrEqual(MAX_CLARIFICATION_ATTEMPTS);
      }
    }
  });
});

function answerUntilReviewOrClarification(state: DiscoveryState) {
  let current = state;
  while (current.stage === "REQUIREMENTS_DISCOVERY" && current.currentField) {
    current = processTurn({ message: FIELD_EXAMPLES[current.currentField].CUSTOMER_CHURN, state: current, role: "REQUIREMENTS_DISCOVERY" }).state;
  }
  return current;
}

describe("requirements extraction in conversation", () => {
  it("records answers to the expected field in the user's own words", () => {
    const { state, last } = converse(["I need a churn dashboard", "Postpaid churn rose to 1.8% and we cannot see who leaves"]);
    expect(state.fields.problemStatement).toEqual({
      value: "Postpaid churn rose to 1.8% and we cannot see who leaves",
      status: "PROVIDED",
      clarificationCount: 0,
    });
    expect(last.reply).toContain("I've recorded the problem statement");
  });

  it("records explicit statements about other fields and does not ask for them again", () => {
    const start = converse([
      "I need a churn dashboard",
      FIELD_EXAMPLES.problemStatement.CUSTOMER_CHURN,
      "Reduce churn by acting earlier. The reporting period is the last 24 months.",
    ]).state;
    expect(start.fields.desiredOutcome.value).toBe("Reduce churn by acting earlier");
    expect(start.fields.reportingPeriod).toMatchObject({ status: "PROVIDED", value: "last 24 months" });

    const asked: RequirementFieldKey[] = [];
    let state = start;
    while (state.currentField) {
      asked.push(state.currentField);
      state = processTurn({ message: FIELD_EXAMPLES[state.currentField].CUSTOMER_CHURN, state, role: "REQUIREMENTS_DISCOVERY" }).state;
    }
    expect(asked).not.toContain("reportingPeriod");
    expect(new Set(asked).size).toBe(asked.length);
  });

  it("does not penalize the current field when the message only names another field", () => {
    const opening = converse(["I need a churn dashboard"]).state;
    const result = processTurn({ message: "The data source is CRM.", state: opening, role: "REQUIREMENTS_DISCOVERY" });
    expect(result.state.fields.problemStatement).toMatchObject({ status: "MISSING", clarificationCount: 0 });
    expect(result.state.fields.dataSources.status).toBe("PROVIDED");
    expect(result.events).toContainEqual({ type: "QUESTION_ASKED", field: "problemStatement", kind: "REPEAT" });
  });

  it("every example DORA shows is accepted by its own field rules", () => {
    for (const key of REQUIREMENT_FIELD_KEYS) {
      for (const example of Object.values(FIELD_EXAMPLES[key])) {
        expect(evaluateAnswer(key, example), `${key}: ${example}`).toMatchObject({ kind: "clear" });
      }
    }
  });
});

describe("explicit corrections", () => {
  const collected = () =>
    answerUntilReview(converse(["I need a customer churn dashboard."]).state);

  it.each([
    ["Actually, the KPI should be net churn rate per tariff", "keyMetrics", "net churn rate per tariff"],
    ["Change the target users to regional retention managers", "intendedUsers", "regional retention managers"],
    ["The data source is not CRM; it is the billing data warehouse", "dataSources", "billing data warehouse"],
  ])("%j updates only %s", (message, field, value) => {
    const before = collected();
    const result = processTurn({ message, state: before, role: "REQUIREMENTS_DISCOVERY" });

    expect(result.state.fields[field as RequirementFieldKey].value).toBe(value);
    expect(result.events).toContainEqual({
      type: "FIELD_CORRECTED",
      field,
      previousValue: before.fields[field as RequirementFieldKey].value,
      value,
    });
    for (const key of REQUIREMENT_FIELD_KEYS.filter((k) => k !== field)) {
      expect(result.state.fields[key]).toEqual(before.fields[key]);
    }
    expect(result.completenessPercentage).toBe(calculateRequirementsCompleteness(result.state.fields));
  });

  it("fills a skipped field through a correction and recalculates progress", () => {
    const start = converse(["I need a churn dashboard", "skip"]).state;
    const result = processTurn({
      message: "Actually, the business problem is that churn rose to 1.8% last quarter",
      state: start,
      role: "REQUIREMENTS_DISCOVERY",
    });
    expect(result.state.fields.problemStatement).toMatchObject({ status: "PROVIDED", value: "that churn rose to 1.8% last quarter" });
    expect(result.completenessPercentage).toBe(6);
  });

  it.each([
    ["Actually, make that monthly", "NO_FIELD"],
    ["Change the KPI to revenue and the users to store managers", "MULTIPLE_FIELDS"],
    ["Change the data source to something", "UNUSABLE_VALUE"],
  ])("asks for clarification instead of overwriting for %j", (message, reason) => {
    const before = collected();
    const result = processTurn({ message, state: before, role: "REQUIREMENTS_DISCOVERY" });
    expect(result.events).toContainEqual({ type: "CORRECTION_AMBIGUOUS", reason });
    expect(result.state.fields).toEqual(before.fields);
    expect(result.reply).toContain("haven't changed anything");
  });

  it("does not overwrite a provided field from a plain statement without a correction cue", () => {
    const before = collected();
    const result = processTurn({ message: "The KPI is revenue.", state: before, role: "REQUIREMENTS_DISCOVERY" });
    expect(result.state.fields.keyMetrics).toEqual(before.fields.keyMetrics);
    expect(result.events.some((event) => event.type === "STATEMENT_CONFLICT")).toBe(true);
  });
});

describe("review and BRD suggestion", () => {
  it("summarizes the requirements, then suggests the BRD after confirmation", () => {
    const review = answerUntilReview(converse(["I need a customer churn dashboard."]).state);
    expect(review.stage).toBe("REQUIREMENTS_REVIEW");
    expect(calculateRequirementsCompleteness(review.fields)).toBe(100);

    const notConfirmed = processTurn({ message: "What happens next?", state: review, role: "REQUIREMENTS_DISCOVERY" });
    expect(notConfirmed.state.stage).toBe("REQUIREMENTS_REVIEW");
    expect(notConfirmed.suggestBrd).toBe(false);

    const confirmed = processTurn({ message: "Looks good", state: review, role: "REQUIREMENTS_DISCOVERY" });
    expect(confirmed.state.stage).toBe("BRD_GENERATION");
    expect(confirmed.suggestBrd).toBe(true);
    expect(confirmed.events).toContainEqual({ type: "REQUIREMENTS_CONFIRMED" });
    expect(confirmed.reply).toContain("All 18 required fields are complete");
  });

  it("lists incomplete fields when suggesting a draft BRD", () => {
    let state = converse(["I need a churn dashboard", "skip"]).state;
    state = answerUntilReview(state);
    const review = processTurn({ message: "Looks good", state, role: "REQUIREMENTS_DISCOVERY" });
    expect(review.suggestBrd).toBe(true);
    expect(review.reply).toContain("1 required field is still incomplete: Problem statement");
    expect(review.reply).toContain("draft");
  });

  it("shows the review summary with missing information marked", () => {
    let state = converse(["I need a churn dashboard", "skip"]).state;
    let reply = "";
    for (let i = 0; i < 40 && state.currentField; i++) {
      const result = processTurn({ message: FIELD_EXAMPLES[state.currentField].CUSTOMER_CHURN, state, role: "REQUIREMENTS_DISCOVERY" });
      state = result.state;
      reply = result.reply;
    }
    expect(reply).toContain("Here is the summary (17 of 18 required fields complete, 94%)");
    expect(reply).toContain("• Problem statement: Not specified (skipped)");
  });
});

describe("assistant roles", () => {
  const afterValidation = () =>
    converse(["I need a churn dashboard", FIELD_EXAMPLES.problemStatement.CUSTOMER_CHURN, FIELD_EXAMPLES.desiredOutcome.CUSTOMER_CHURN]).state;

  it("keeps collected requirements when the role changes (Scenario H)", () => {
    const before = afterValidation();
    const result = processTurn({ message: "Today we use a monthly Excel export", state: before, role: "DATA_REQUIREMENTS_ANALYST" });
    expect(result.state.fields.problemStatement).toEqual(before.fields.problemStatement);
    expect(result.state.fields.desiredOutcome).toEqual(before.fields.desiredOutcome);
    expect(result.state.fields.currentSituation.status).toBe("PROVIDED");
  });

  it("changes question priorities and templates", () => {
    const state = afterValidation();
    const nextQuestion = (role: AssistantRole) =>
      processTurn({ message: "Today the retention team uses a monthly Excel list", state: { ...state }, role }).state.currentField;
    expect(nextQuestion("REQUIREMENTS_DISCOVERY")).toBe("businessImpact");
    expect(nextQuestion("DATA_REQUIREMENTS_ANALYST")).toBe("keyMetrics");

    const xy = converse(["I need a churn dashboard", FIELD_EXAMPLES.problemStatement.CUSTOMER_CHURN], { role: "XY_PROBLEM_DIAGNOSTIC" });
    expect(xy.state).toMatchObject({ stage: "BUSINESS_PROBLEM_VALIDATION", currentField: "currentSituation" });

    const brd = converse(["I need a churn dashboard", FIELD_EXAMPLES.problemStatement.CUSTOMER_CHURN], { role: "BRD_GENERATOR" });
    expect(brd.last.reply).toContain("Completeness: 6% (1 of 18 required fields).");
    expect(brd.last.reply).toContain("Section 2 of 7 · Business Objectives.");
  });
});

describe("determinism and state integrity", () => {
  const messages = [
    "I need a customer churn dashboard.",
    "A dashboard",
    FIELD_EXAMPLES.problemStatement.CUSTOMER_CHURN,
    "not sure",
    "Actually, the KPI should be churn rate",
    FIELD_EXAMPLES.desiredOutcome.CUSTOMER_CHURN,
  ];

  it("produces the same result for the same input and state", () => {
    for (const role of ROLES) expect(converse(messages, { role }).results).toEqual(converse(messages, { role }).results);
  });

  it("does not mutate the input state", () => {
    const state = createInitialDiscoveryState();
    const snapshot = structuredClone(state);
    processTurn({ message: "I need a churn dashboard", state, role: "REQUIREMENTS_DISCOVERY" });
    expect(state).toEqual(snapshot);
  });

  it("returns states that pass schema validation and matching completeness", () => {
    for (const result of converse(messages).results) {
      expect(discoveryStateSchema.safeParse(result.state).success).toBe(true);
      expect(result.completenessPercentage).toBe(calculateRequirementsCompleteness(result.state.fields));
    }
  });

  it("preserves previously collected requirements across unrelated turns", () => {
    const { state } = converse(messages);
    const before = providedValues(state);
    const after = converse(["hmm", "The data source is CRM", "skip"], { state }).state;
    expect(providedValues(after)).toMatchObject(before);
  });

  it("never claims to use a real AI model", () => {
    for (const result of converse(messages).results) {
      expect(result.reply).not.toMatch(/\b(?:GPT|LLM|language model|neural|I understand)\b/iu);
    }
  });
});
