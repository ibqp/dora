import { describe, expect, it } from "vitest";

import { classifyScenario } from "./classification";

describe("classifyScenario", () => {
  it.each([
    ["I need a customer churn dashboard.", "CUSTOMER_CHURN"],
    ["Why are cancellations and customer loss increasing in postpaid?", "CUSTOMER_CHURN"],
    ["We want a sales dashboard with revenue and conversion per store", "SALES_PERFORMANCE"],
    ["Report on network outages, latency and dropped calls in the north", "NETWORK_PERFORMANCE"],
    ["Coverage problems for 5G sites", "NETWORK_PERFORMANCE"],
  ])("classifies %j as %s", (text, scenario) => {
    expect(classifyScenario(text).scenario).toBe(scenario);
  });

  it("falls back to the generic scenario without matching keywords", () => {
    const result = classifyScenario("Can you help me with a monthly cost report for finance?");
    expect(result).toMatchObject({ scenario: "GENERIC_ANALYTICS", confidence: "LOW", matchedTerms: [] });
  });

  it("falls back to the generic scenario when two scenarios score equally", () => {
    // retention (2) vs sales (2): no clear winner.
    expect(classifyScenario("retention and sales overview").scenario).toBe("GENERIC_ANALYTICS");
  });

  it("does not treat a single weak keyword as sufficient evidence", () => {
    expect(classifyScenario("Can you cancel my meeting?").scenario).toBe("GENERIC_ANALYTICS");
  });

  it("ignores negated keywords", () => {
    expect(classifyScenario("This is not about churn; we need a revenue and sales overview").scenario).toBe(
      "SALES_PERFORMANCE",
    );
  });

  it("reports matched terms and confidence", () => {
    const result = classifyScenario("Churn and retention analysis");
    expect(result.scenario).toBe("CUSTOMER_CHURN");
    expect(result.matchedTerms).toEqual(["churn", "retention"]);
    expect(result.confidence).toBe("HIGH");
  });

  it("uses a configurable dictionary", () => {
    const dictionary = {
      CUSTOMER_CHURN: [],
      SALES_PERFORMANCE: [],
      NETWORK_PERFORMANCE: [{ term: "wifi", weight: 3 }],
    };
    expect(classifyScenario("wifi quality report", dictionary).scenario).toBe("NETWORK_PERFORMANCE");
    expect(classifyScenario("network quality report", dictionary).scenario).toBe("GENERIC_ANALYTICS");
  });

  it("is deterministic", () => {
    const text = "sales revenue and churn";
    expect(classifyScenario(text)).toEqual(classifyScenario(text));
  });
});
