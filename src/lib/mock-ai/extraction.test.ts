import { describe, expect, it } from "vitest";

import { detectCorrection, evaluateAnswer, extractStatements, removeStatements } from "./extraction";
import { detectProposedSolution, isSolutionOnly } from "./solution-detection";

describe("XY-problem solution detection", () => {
  it.each([
    ["I need a customer churn dashboard.", "customer churn dashboard"],
    ["Can you build a sales dashboard with revenue per store?", "sales dashboard"],
    ["We need a report on dropped calls", "report"],
    ["Please create a weekly churn report", "weekly churn report"],
  ])("extracts the proposed solution from %j", (text, solution) => {
    expect(detectProposedSolution(text)).toBe(solution);
  });

  it("returns null when no solution is named", () => {
    expect(detectProposedSolution("Churn has been increasing for months")).toBeNull();
  });

  it("recognizes answers that only describe a solution", () => {
    expect(isSolutionOnly("A churn dashboard.")).toBe(true);
    expect(isSolutionOnly("I want a report with all KPIs for management")).toBe(true);
    expect(isSolutionOnly("We need a dashboard because churn is increasing")).toBe(false);
    expect(isSolutionOnly("Churn increased by 20% last quarter")).toBe(false);
  });
});

describe("evaluateAnswer", () => {
  it("rejects a proposed solution as the business problem", () => {
    expect(evaluateAnswer("problemStatement", "A churn dashboard")).toEqual({
      kind: "unclear",
      reason: "SOLUTION_NOT_PROBLEM",
    });
  });

  it("rejects a deliverable as the desired outcome", () => {
    expect(evaluateAnswer("desiredOutcome", "A dashboard for management")).toEqual({
      kind: "unclear",
      reason: "SOLUTION_NOT_OUTCOME",
    });
  });

  it("accepts a problem with problem indicators and keeps the user's own words", () => {
    const answer = "Postpaid churn increased and we cannot tell which customers will leave.";
    expect(evaluateAnswer("problemStatement", answer)).toEqual({ kind: "clear", value: answer });
  });

  it.each(["I don't know", "not sure", "no idea", "?", "ok", "maybe"])("treats %j as a non-answer", (answer) => {
    expect(evaluateAnswer("keyMetrics", answer)).toEqual({ kind: "unclear", reason: "NON_ANSWER" });
  });

  it("requires field evidence for strict fields", () => {
    expect(evaluateAnswer("usageFrequency", "weekly").kind).toBe("clear");
    expect(evaluateAnswer("usageFrequency", "every 4 hours").kind).toBe("clear");
    expect(evaluateAnswer("usageFrequency", "whenever the managers have time for it").kind).toBe("unclear");
    expect(evaluateAnswer("reportingPeriod", "the last 24 months").kind).toBe("clear");
    expect(evaluateAnswer("reportingPeriod", "a long time").kind).toBe("unclear");
    expect(evaluateAnswer("dataGranularity", "per customer and month").kind).toBe("clear");
    expect(evaluateAnswer("requestingStakeholder", "Fewer complaints and fewer field visits").kind).toBe("unclear");
  });

  it("accepts longer specific answers without keywords where a fallback is allowed", () => {
    expect(evaluateAnswer("acceptanceConditions", "Numbers agree with what finance publishes every quarter end").kind).toBe(
      "clear",
    );
  });

  it("treats uncertain answers without evidence as non-answers", () => {
    expect(evaluateAnswer("dataSources", "I don't know which one we would want to use here").kind).toBe("unclear");
    expect(evaluateAnswer("dataSources", "not sure, probably the CRM").kind).toBe("clear");
  });

  it("is deterministic", () => {
    expect(evaluateAnswer("keyMetrics", "churn rate")).toEqual(evaluateAnswer("keyMetrics", "churn rate"));
  });
});

describe("extractStatements", () => {
  it("extracts explicitly named fields", () => {
    expect(
      extractStatements("CRM and billing. The reporting period is the last 24 months, and the KPI is churn rate.").map(
        ({ field, value }) => [field, value],
      ),
    ).toEqual([
      ["reportingPeriod", "last 24 months"],
      ["keyMetrics", "churn rate"],
    ]);
  });

  it("supports the colon form", () => {
    expect(extractStatements("Data sources: CRM and billing")).toMatchObject([
      { field: "dataSources", value: "CRM and billing" },
    ]);
  });

  it("does not use ambiguous words such as 'users' or 'problem' as field names", () => {
    expect(extractStatements("The problem is that users are leaving")).toEqual([]);
  });

  it("removes statements from the rest of the answer", () => {
    const message = "CRM and billing. The reporting period is the last 24 months.";
    expect(removeStatements(message, extractStatements(message))).toBe("CRM and billing");
  });
});

describe("detectCorrection", () => {
  it.each([
    ["Actually, the KPI should be monthly churn rate", "keyMetrics", "monthly churn rate"],
    ["Change the target users to retention managers", "intendedUsers", "retention managers"],
    ["The data source is not CRM; it is the billing system.", "dataSources", "billing system"],
    ["The data source isn't CRM but the data warehouse", "dataSources", "data warehouse"],
    ["Update the reporting period to the last 12 months", "reportingPeriod", "last 12 months"],
    ["Actually, the frequency is daily", "usageFrequency", "daily"],
    ["The reporting period should be the current fiscal year", "reportingPeriod", "current fiscal year"],
  ])("detects %j", (message, field, value) => {
    expect(detectCorrection(message)).toEqual({ kind: "correction", field, value });
  });

  it("prefers the longest field name (target users, not target)", () => {
    expect(detectCorrection("Change the target users to store managers")).toMatchObject({ field: "intendedUsers" });
    expect(detectCorrection("Change the target to 95%")).toMatchObject({ field: "successCriteria" });
  });

  it("flags corrections that name several fields", () => {
    expect(detectCorrection("Change the KPI to revenue and the users to store managers")).toEqual({
      kind: "ambiguous",
      reason: "MULTIPLE_FIELDS",
    });
  });

  it("flags corrections without a usable value", () => {
    expect(detectCorrection("Change the KPI to something")).toEqual({ kind: "ambiguous", reason: "UNUSABLE_VALUE" });
  });

  it("reports a correction cue without a field name", () => {
    expect(detectCorrection("Actually, make that monthly")).toEqual({ kind: "cue-only" });
    expect(detectCorrection("Change it to something else")).toEqual({ kind: "cue-only" });
  });

  it("does not treat ordinary answers as corrections", () => {
    expect(detectCorrection("Retention managers should be able to filter by region")).toEqual({ kind: "none" });
    expect(detectCorrection("Today the problem is not visible, it is hidden in Excel")).toEqual({ kind: "none" });
    expect(detectCorrection("Weekly")).toEqual({ kind: "none" });
  });
});
