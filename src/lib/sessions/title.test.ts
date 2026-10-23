import { describe, expect, it } from "vitest";

import { DERIVED_TITLE_LENGTH, deriveSessionTitle, FALLBACK_SESSION_TITLE } from "./title";

describe("deriveSessionTitle", () => {
  it("uses a short first message as-is", () => {
    expect(deriveSessionTitle("I need a customer churn dashboard")).toBe("I need a customer churn dashboard");
  });

  it("uses only the first sentence", () => {
    expect(deriveSessionTitle("I need a churn dashboard. It is for the retention team.")).toBe(
      "I need a churn dashboard",
    );
  });

  it("uses the first non-empty line and collapses whitespace", () => {
    expect(deriveSessionTitle("\n\n  Sales   performance\treport \nfor Q3")).toBe("Sales performance report");
  });

  it("does not split on dots inside words or numbers", () => {
    expect(deriveSessionTitle("Network KPIs v2.1 for the B2B segment")).toBe(
      "Network KPIs v2.1 for the B2B segment",
    );
  });

  it("shortens long text at a word boundary with an ellipsis", () => {
    const title = deriveSessionTitle(
      "We would like to understand why prepaid customers in the northern region cancel their subscriptions",
    );
    expect(title.length).toBeLessThanOrEqual(DERIVED_TITLE_LENGTH);
    expect(title).toBe("We would like to understand why prepaid customers in the…");
  });

  it("hard-cuts a single very long word", () => {
    const title = deriveSessionTitle("x".repeat(200));
    expect(title).toHaveLength(DERIVED_TITLE_LENGTH);
    expect(title.endsWith("…")).toBe(true);
  });

  it("falls back when there is no usable text", () => {
    expect(deriveSessionTitle("   \n  ")).toBe(FALLBACK_SESSION_TITLE);
    expect(deriveSessionTitle("...")).toBe(FALLBACK_SESSION_TITLE);
  });
});
