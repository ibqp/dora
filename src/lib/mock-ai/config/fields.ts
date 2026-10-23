/**
 * Extraction rules for the 18 requirement fields.
 *
 * An answer to the field DORA asked about is accepted ("sufficiently specific") when it is not a
 * non-answer, has at least `minWords` words, and either contains field evidence (a keyword or
 * pattern) or — where `fallbackMinWords` is set — is at least that long. Fields with
 * `fallbackMinWords: null` always require evidence (e.g. a frequency must name a frequency).
 *
 * Aliases are the names users give a field in explicit statements and corrections. `strong`
 * aliases are unambiguous and may fill a field from any message ("The data source is CRM");
 * `weak` aliases ("users", "source") are only used together with an explicit correction cue.
 */
import type { RequirementFieldKey } from "@/lib/requirements/fields";

export type SolutionCheck = "PROBLEM" | "OUTCOME";

export interface FieldRule {
  keywords: readonly string[];
  patterns: readonly RegExp[];
  minWords: number;
  fallbackMinWords: number | null;
  /** Reject answers that only describe a solution (XY-problem validation). */
  rejectSolutionOnly?: SolutionCheck;
  aliases: { strong: readonly string[]; weak: readonly string[] };
}

const NUMBER = /\d/u;
const PERCENT = /\d+(?:[.,]\d+)?\s*(?:%|percent\b|pp\b|percentage points?)/iu;
const MONEY = /[€$£]\s*\d|\d\s*(?:€|eur\b|euros?\b|usd\b|k\b|m\b|million\b|thousand\b)/iu;

const ORG_UNITS = [
  "team", "teams", "department", "unit", "division", "management", "manager", "managers",
  "director", "directors", "head of", "lead", "vp", "cfo", "ceo", "cto", "coo", "board",
  "marketing", "sales", "finance", "controlling", "operations", "network operations",
  "customer care", "customer service", "care", "retention", "b2b", "b2c", "product", "strategy",
  "commercial", "analytics", "data team", "hr", "procurement", "legal", "executive", "executives",
  "it department", "it team",
  "noc", "engineering", "planning", "regional", "store", "stores", "call center", "call centre",
  "pricing", "insights", "bi", "reporting team", "office", "group", "owner", "owners", "partner",
  "partners", "customer experience", "cx", "supervisors", "supervisor", "officer", "chief",
];

export const PROBLEM_INDICATORS = [
  "problem", "problems", "issue", "issues", "challenge", "challenges", "because", "struggle",
  "struggling", "losing", "lose", "lost", "loss", "decline", "declining", "declined", "drop",
  "dropping", "dropped", "decrease", "decreasing", "decreased", "increase", "increasing",
  "increased", "rising", "rose", "growing", "too high", "too low", "too many", "too few",
  "complaint", "complaints", "can't", "cannot", "can not", "unable", "don't know why",
  "do not know why", "no visibility", "lack", "lacking", "missing", "slow", "manual",
  "manually", "delay", "delays", "delayed", "error", "errors", "costly", "risk", "unclear",
  "difficult", "hard to", "fail", "failing", "failed", "behind", "below target", "miss",
  "worse", "worsening", "inconsistent", "not able", "takes too long", "time-consuming",
];

export const OUTCOME_INDICATORS = [
  "reduce", "reduced", "reducing", "increase", "improve", "improved", "improving", "lower",
  "decrease", "prevent", "enable", "faster", "better", "achieve", "grow", "retain", "stabilize",
  "stabilise", "avoid", "minimize", "minimise", "maximize", "maximise", "identify",
  "detect", "respond", "react", "prioritize", "prioritise", "save", "cut", "boost", "raise",
  "keep", "win back", "target", "so that", "in order to",
];

export const FIELD_RULES: Record<RequirementFieldKey, FieldRule> = {
  problemStatement: {
    keywords: PROBLEM_INDICATORS,
    patterns: [],
    minWords: 3,
    fallbackMinWords: 8,
    rejectSolutionOnly: "PROBLEM",
    aliases: { strong: ["business problem", "problem statement"], weak: ["problem", "issue"] },
  },
  currentSituation: {
    keywords: [
      "today", "currently", "current", "at the moment", "right now", "manual", "manually", "excel",
      "spreadsheet", "existing", "process", "we use", "we have", "there is no", "we don't have",
      "we do not have", "ad hoc", "by hand", "at present", "so far", "workaround",
    ],
    patterns: [],
    minWords: 3,
    fallbackMinWords: 6,
    aliases: { strong: ["current situation", "current process", "current state"], weak: ["situation"] },
  },
  businessImpact: {
    keywords: [
      "cost", "costs", "revenue", "loss", "lose", "losing", "customers", "hours", "time", "risk",
      "satisfaction", "nps", "complaints", "penalty", "penalties", "fines", "margin", "profit",
      "efficiency", "money", "budget", "reputation", "sla", "churn",
    ],
    patterns: [NUMBER, PERCENT, MONEY],
    minWords: 2,
    fallbackMinWords: 6,
    aliases: { strong: ["business impact"], weak: ["impact"] },
  },
  desiredOutcome: {
    keywords: OUTCOME_INDICATORS,
    patterns: [],
    minWords: 3,
    fallbackMinWords: 7,
    rejectSolutionOnly: "OUTCOME",
    aliases: {
      strong: ["desired outcome", "desired business outcome", "business outcome", "business objective"],
      weak: ["outcome", "objective", "goal"],
    },
  },
  expectedValue: {
    keywords: [
      "save", "saving", "savings", "revenue", "profit", "cost", "costs", "hours", "time", "retain",
      "retained", "value", "roi", "margin", "efficiency", "fewer", "less", "more", "customers",
    ],
    patterns: [NUMBER, PERCENT, MONEY],
    minWords: 2,
    fallbackMinWords: 6,
    aliases: { strong: ["expected value", "expected business value", "business value"], weak: ["value", "benefit"] },
  },
  requestingStakeholder: {
    keywords: ORG_UNITS,
    patterns: [],
    minWords: 1,
    // Must name a unit or role; arbitrary text is not accepted as a stakeholder.
    fallbackMinWords: null,
    aliases: {
      strong: ["requesting stakeholder", "requesting business unit", "business unit", "requester", "requestor", "sponsor"],
      weak: ["stakeholder", "stakeholders"],
    },
  },
  intendedUsers: {
    keywords: [
      ...ORG_UNITS, "users", "analysts", "analyst", "agents", "engineers", "leadership", "staff",
      "employees", "colleagues", "planners", "specialists", "representatives", "reps", "me",
      "myself", "our team", "my team", "everyone",
    ],
    patterns: [],
    minWords: 1,
    fallbackMinWords: null,
    aliases: {
      strong: ["intended users", "target users", "end users", "target audience"],
      weak: ["users", "user", "audience"],
    },
  },
  analyticalCapability: {
    keywords: [
      "identify", "predict", "prediction", "segment", "segmentation", "compare", "comparison",
      "track", "monitor", "monitoring", "analyse", "analyze", "analysis", "forecast", "drill down",
      "drill-down", "filter", "trend", "trends", "breakdown", "break down", "detect", "rank",
      "prioritize", "prioritise", "see", "view", "understand", "explain", "root cause", "correlate",
      "alert", "measure", "benchmark", "spot", "flag",
    ],
    patterns: [],
    minWords: 2,
    fallbackMinWords: 6,
    aliases: { strong: ["analytical capability", "required capability"], weak: ["capability", "functionality"] },
  },
  expectedOutput: {
    keywords: [
      "dashboard", "report", "excel", "spreadsheet", "presentation", "slides", "dataset", "data set",
      "extract", "alert", "alerts", "model", "api", "list", "table", "chart", "charts", "pdf",
      "power bi", "tableau", "email", "notification", "notifications", "csv", "one-pager",
      "scorecard", "overview", "file",
    ],
    patterns: [],
    minWords: 1,
    fallbackMinWords: 6,
    aliases: { strong: ["expected output", "deliverable", "output format"], weak: ["output", "format"] },
  },
  usageFrequency: {
    keywords: [
      "daily", "weekly", "monthly", "quarterly", "yearly", "annually", "annual", "hourly",
      "real-time", "real time", "near real-time", "ad hoc", "ad-hoc", "on demand", "on-demand",
      "biweekly", "bi-weekly", "fortnightly", "every day", "every week", "every month",
      "every quarter", "every morning", "once a", "twice a", "per week", "per month", "per day",
      "each week", "each month", "each day", "each morning", "continuously", "live",
    ],
    patterns: [
      /\bevery\s+\d+\s+(?:minutes?|hours?|days?|weeks?|months?)\b/iu,
      /\b\d+\s*(?:x|times)\s*(?:a|per)\s*(?:day|week|month|quarter|year)\b/iu,
    ],
    minWords: 1,
    fallbackMinWords: null,
    aliases: {
      strong: ["reporting frequency", "usage frequency", "update frequency", "refresh frequency", "refresh rate"],
      weak: ["frequency", "refresh"],
    },
  },
  dataSources: {
    keywords: [
      "crm", "billing", "erp", "data warehouse", "dwh", "warehouse", "data lake", "lakehouse", "sap",
      "salesforce", "siebel", "oracle", "database", "databases", "db", "sql", "oss", "bss",
      "network logs", "logs", "cdr", "cdrs", "call detail records", "excel", "spreadsheet",
      "survey", "surveys", "google analytics", "web analytics", "ticketing", "ticket system", "pos",
      "snowflake", "bigquery", "redshift", "databricks", "hadoop", "system", "systems", "platform",
      "api", "table", "tables", "feed", "export", "file", "files", "probe", "probes", "nms",
      "monitoring", "inventory",
    ],
    patterns: [],
    minWords: 1,
    fallbackMinWords: 3,
    aliases: {
      strong: ["data source", "data sources", "source system", "source systems"],
      weak: ["source", "sources"],
    },
  },
  dataElements: {
    keywords: [
      "customer", "customers", "contract", "contracts", "tariff", "tariffs", "plan", "plans",
      "subscription", "subscriptions", "region", "regions", "product", "products", "transaction",
      "transactions", "order", "orders", "invoice", "invoices", "payment", "payments", "cell",
      "cells", "site", "sites", "device", "devices", "usage", "call", "calls", "session",
      "sessions", "ticket", "tickets", "complaint", "complaints", "segment", "segments", "date",
      "dates", "timestamp", "timestamps", "age", "tenure", "revenue", "price", "prices", "channel",
      "channels", "store", "stores", "agent", "agents", "event", "events", "id", "ids",
      "attributes", "fields", "columns", "subscriber", "subscribers", "account", "accounts",
    ],
    patterns: [/[^,]+,[^,]+/u],
    minWords: 1,
    fallbackMinWords: 4,
    aliases: {
      strong: ["data elements", "data element", "required data", "data entities", "data fields"],
      weak: ["entities", "elements"],
    },
  },
  reportingPeriod: {
    keywords: [
      "year to date", "ytd", "mtd", "qtd", "rolling", "historical", "history", "last year",
      "this year", "last quarter", "last month", "current year", "fiscal year", "previous year",
      "quarter", "quarters",
    ],
    patterns: [
      /\b(?:last|past|previous|recent|rolling)\s+(?:\d+|one|two|three|four|five|six|twelve|eighteen|twenty-four)\s+(?:days?|weeks?|months?|years?|quarters?)\b/iu,
      /\b\d+\s+(?:days?|weeks?|months?|years?|quarters?)\b/iu,
      /\bsince\s+(?:\d{4}|january|february|march|april|may|june|july|august|september|october|november|december)\b/iu,
      /\b(?:19|20)\d{2}\b/u,
      /\bq[1-4]\b/iu,
      /\bfrom\s+\S+.*\bto\s+\S+/iu,
    ],
    minWords: 1,
    fallbackMinWords: null,
    aliases: {
      strong: ["reporting period", "time range", "time period", "date range", "time frame", "timeframe"],
      weak: ["period", "range"],
    },
  },
  dataGranularity: {
    keywords: ["granular", "aggregated", "aggregate", "individual", "daily", "weekly", "monthly", "hourly", "one row per"],
    patterns: [
      /\b(?:per|by|for each|each)\s+(?:customer|contract|day|week|month|quarter|region|cell|site|store|product|transaction|subscriber|account|hour|segment|agent|channel|tariff|device|call|department|cost cent(?:re|er)|business unit|team)s?\b/iu,
      /\b(?:customer|contract|transaction|subscriber|account|segment|record|row|cell|site|store|region|product|daily|weekly|monthly|hourly|aggregate)[- ]level\b/iu,
    ],
    minWords: 1,
    fallbackMinWords: null,
    aliases: {
      strong: ["data granularity", "granularity", "level of detail", "grain"],
      weak: ["level"],
    },
  },
  keyMetrics: {
    keywords: [
      "rate", "rates", "percentage", "percent", "ratio", "count", "number of", "average", "avg",
      "mean", "median", "total", "sum", "arpu", "arpa", "nps", "csat", "revenue", "conversion",
      "retention", "latency", "uptime", "availability", "kpi", "kpis", "clv", "ltv", "aht",
      "mou", "margin", "volume", "share", "growth", "throughput", "sla", "mttr", "cost per",
      "churn", "drop", "drops", "speed", "duration", "score",
    ],
    patterns: [PERCENT],
    minWords: 1,
    fallbackMinWords: 5,
    aliases: {
      strong: ["key metrics", "key metric", "kpi", "kpis", "business metrics", "main metric"],
      weak: ["metric", "metrics", "measure", "measures"],
    },
  },
  successCriteria: {
    keywords: [
      "target", "below", "above", "at least", "at most", "within", "threshold", "goal", "achieve",
      "under", "over", "less than", "more than", "baseline", "benchmark", "by the end of",
    ],
    patterns: [
      PERCENT,
      NUMBER,
      /\b(?:reduce|increase|improve|lower|raise|cut|grow|decrease)\w*\b.*\bby\b/iu,
      /\bfrom\s+\S+\s+to\s+\S+/iu,
    ],
    minWords: 2,
    fallbackMinWords: 7,
    aliases: {
      strong: ["success criteria", "success criterion", "success metric", "target value", "target values"],
      weak: ["target", "targets"],
    },
  },
  acceptanceConditions: {
    keywords: [
      "must", "should", "when", "accepted", "accept", "sign off", "sign-off", "signed off",
      "approve", "approved", "approval", "includes", "include", "available", "accurate", "accuracy",
      "matches", "reconcile", "reconciles", "validated", "tested", "delivered", "refreshed",
      "refreshes", "complete", "completeness", "documented", "deadline", "criteria", "covers",
    ],
    patterns: [],
    minWords: 3,
    fallbackMinWords: 7,
    aliases: {
      strong: ["acceptance criteria", "acceptance conditions", "acceptance condition"],
      weak: ["acceptance"],
    },
  },
  validationCriteria: {
    keywords: [
      "compare", "compared", "comparison", "reconcile", "reconciliation", "match", "matches",
      "validate", "validation", "verify", "verification", "test", "testing", "check", "checks",
      "accuracy", "against", "cross-check", "sample", "sampling", "audit", "uat", "sign-off",
      "tolerance", "deviation", "review", "reviewed", "spot check", "spot-check",
    ],
    patterns: [PERCENT],
    minWords: 2,
    fallbackMinWords: 7,
    aliases: {
      strong: ["validation criteria", "verification criteria", "validation approach"],
      weak: ["validation", "verification"],
    },
  },
};

/** Proposed-solution vocabulary used for XY-problem detection. */
export const SOLUTION_TERMS = [
  "dashboard", "dashboards", "report", "reports", "reporting", "tool", "chart", "charts", "graph",
  "visualization", "visualisation", "prediction model", "predictive model", "model", "forecast",
  "data extract", "extract", "export", "spreadsheet", "excel file", "excel", "alert", "alerts",
  "app", "application", "query", "table", "power bi", "tableau", "scorecard", "kpi report",
  "overview", "analysis",
];

/** Openings that ask for something to be built or delivered. */
export const REQUEST_OPENING =
  /^(?:hi[,!]?\s+|hello[,!]?\s+)?(?:i|we)\s+(?:need|want|would like|['’]d like|require)\b|^(?:can|could|would)\s+you\b|^please\b|^(?:build|create|make|give me|provide|set up|develop)\b|^(?:a|an|the)\s+/iu;

/** Maximum number of clarification questions per field before it is marked SKIPPED. */
export const MAX_CLARIFICATION_ATTEMPTS = 2;
