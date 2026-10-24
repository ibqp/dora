/**
 * Configurable keyword dictionaries for scenario classification (MASTER_SPEC.md §4).
 * Each matched term adds its weight to the scenario score. Terms preceded by a negation
 * ("not about churn") are ignored. Phrases may overlap with single words and then add up.
 */
import { Scenario } from "@/generated/prisma/enums";

export interface KeywordRule {
  term: string;
  weight: number;
}

export type ClassifiableScenario = Exclude<Scenario, typeof Scenario.GENERIC_ANALYTICS>;

export const SCENARIO_KEYWORDS: Record<ClassifiableScenario, readonly KeywordRule[]> = {
  CUSTOMER_CHURN: [
    { term: "churn", weight: 3 },
    { term: "churning", weight: 3 },
    { term: "churned", weight: 3 },
    { term: "customer loss", weight: 3 },
    { term: "losing customers", weight: 3 },
    { term: "customers leaving", weight: 3 },
    { term: "attrition", weight: 3 },
    { term: "retention", weight: 2 },
    { term: "retain", weight: 2 },
    { term: "cancellations", weight: 2 },
    { term: "cancellation", weight: 2 },
    { term: "contract terminations", weight: 2 },
    { term: "win-back", weight: 2 },
    { term: "cancel", weight: 1 },
    { term: "loyalty", weight: 1 },
  ],
  SALES_PERFORMANCE: [
    { term: "sales", weight: 2 },
    { term: "sales dashboard", weight: 2 },
    { term: "revenue", weight: 2 },
    { term: "conversion", weight: 2 },
    { term: "conversion rate", weight: 1 },
    { term: "upsell", weight: 2 },
    { term: "cross-sell", weight: 2 },
    { term: "sales target", weight: 2 },
    { term: "sales targets", weight: 2 },
    { term: "quota", weight: 2 },
    { term: "store performance", weight: 2 },
    { term: "pipeline", weight: 1 },
    { term: "bookings", weight: 1 },
    { term: "orders", weight: 1 },
    { term: "arpu", weight: 1 },
  ],
  NETWORK_PERFORMANCE: [
    { term: "network", weight: 2 },
    { term: "network quality", weight: 2 },
    { term: "outage", weight: 3 },
    { term: "outages", weight: 3 },
    { term: "latency", weight: 3 },
    { term: "dropped calls", weight: 3 },
    { term: "call drops", weight: 3 },
    { term: "packet loss", weight: 3 },
    { term: "coverage", weight: 2 },
    { term: "throughput", weight: 2 },
    { term: "bandwidth", weight: 2 },
    { term: "downtime", weight: 2 },
    { term: "jitter", weight: 2 },
    { term: "cell sites", weight: 2 },
    { term: "base stations", weight: 2 },
    { term: "5g", weight: 1 },
    { term: "4g", weight: 1 },
    { term: "lte", weight: 1 },
  ],
};

/** A scenario is chosen only if its score reaches this value... */
export const MIN_CLASSIFICATION_SCORE = 2;
/** ...and beats the runner-up by at least this margin; otherwise GENERIC_ANALYTICS is used. */
export const MIN_CLASSIFICATION_MARGIN = 1;
/** Score and margin from which a classification is reported as high confidence. */
export const HIGH_CONFIDENCE_SCORE = 4;
export const HIGH_CONFIDENCE_MARGIN = 2;

export const SCENARIO_LABELS: Record<Scenario, string> = {
  CUSTOMER_CHURN: "Customer Churn Analysis",
  SALES_PERFORMANCE: "Sales Performance Dashboard",
  NETWORK_PERFORMANCE: "Network Performance / Quality",
  GENERIC_ANALYTICS: "Generic Analytics Request",
};
