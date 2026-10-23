/**
 * Response templates. Every DORA reply is assembled from these strings; nothing is generated
 * freely. Wording never claims understanding beyond the rules: DORA "records" answers, it does
 * not "understand" them.
 */
import type { Scenario } from "@/generated/prisma/enums";
import { BRD_SECTIONS, FieldStatus, REQUIREMENT_FIELDS, TOTAL_REQUIRED_FIELDS, type RequirementFieldKey } from "@/lib/requirements/fields";
import type { RequirementFields } from "@/lib/requirements/schemas";

import { FIELD_RULES } from "./config/fields";
import { SCENARIO_LABELS } from "./config/scenarios";
import type { RoleProfile } from "./roles";
import { excerpt } from "./text";
import type { ClassificationResult, UnclearReason } from "./types";

export const FIELD_LABELS: Record<RequirementFieldKey, string> = Object.fromEntries(
  REQUIREMENT_FIELDS.map((field) => [field.key, field.label]),
) as Record<RequirementFieldKey, string>;

/** Quotes a user value; avoids doubled punctuation when it ends a sentence. */
export function quoted(value: string): string {
  return `“${excerpt(value)}”`;
}

const endSentence = (text: string) => (/[.!?…]”$/u.test(text) ? text : `${text}.`);

/** Example of how to state a field explicitly, using a name the statement parser recognizes. */
export function statementHint(field: RequirementFieldKey): string {
  const alias = FIELD_RULES[field].aliases.strong[0] ?? fieldName(field);
  return `“${alias.charAt(0).toUpperCase()}${alias.slice(1)}: …”`;
}

/** Lower-case label for use inside sentences. */
export function fieldName(field: RequirementFieldKey): string {
  return FIELD_LABELS[field].charAt(0).toLowerCase() + FIELD_LABELS[field].slice(1);
}

const DEFAULT_QUESTIONS: Record<RequirementFieldKey, string> = {
  problemStatement: "What business problem are you trying to solve, and what decision would the information help you make?",
  currentSituation: "How is this handled today? Please describe the current situation, for example the existing process, reports or workarounds.",
  businessImpact: "What is the business impact of this problem today, for example costs, lost revenue, customer impact or time spent?",
  desiredOutcome: "What business outcome do you want to achieve? Please describe the result for the business, not the deliverable.",
  expectedValue: "What business value do you expect if that outcome is achieved, for example savings, revenue or time?",
  requestingStakeholder: "Which stakeholder or business unit is requesting this?",
  intendedUsers: "Who will use the analytical output, and in which role?",
  analyticalCapability: "What should the analysis enable its users to do, for example compare, monitor, segment or predict?",
  expectedOutput: "What output or deliverable do you expect?",
  usageFrequency: "How often will the output be used or updated, for example daily, weekly or monthly?",
  dataSources: "Which data sources or systems should be used? Please name only sources you know are relevant.",
  dataElements: "Which data elements or entities are required, for example customers, contracts, products or regions?",
  reportingPeriod: "Which reporting period or time range should be covered?",
  dataGranularity: "At what level of detail is the data needed, for example per customer, per day or per region?",
  keyMetrics: "Which key business metrics should be measured?",
  successCriteria: "What are the success criteria or target values, for example a target rate or a percentage change?",
  acceptanceConditions: "Under which conditions would you accept the deliverable?",
  validationCriteria: "How should the results be validated or verified before acceptance?",
};

type ScenarioExamples = Record<Scenario, string>;

/** Short example answers per field and scenario, shown with clarification questions. */
export const FIELD_EXAMPLES: Record<RequirementFieldKey, ScenarioExamples> = {
  problemStatement: {
    CUSTOMER_CHURN: "Postpaid churn rose from 1.2% to 1.8% per month and we cannot tell which customers are about to leave.",
    SALES_PERFORMANCE: "Regional sales managers cannot see which stores miss their targets until the month has closed.",
    NETWORK_PERFORMANCE: "Dropped-call complaints increased in two regions and we cannot locate the affected cells quickly.",
    GENERIC_ANALYTICS: "The team spends two days a month compiling figures manually, and the results are often inconsistent.",
  },
  currentSituation: {
    CUSTOMER_CHURN: "Today the retention team receives a monthly Excel list of cancellations after the customers have already left.",
    SALES_PERFORMANCE: "Today each region exports sales figures from the CRM and combines them in a spreadsheet every Monday.",
    NETWORK_PERFORMANCE: "Today engineers check alarms in the monitoring tool manually and compile a weekly summary.",
    GENERIC_ANALYTICS: "Today the figures are collected manually from several reports by one analyst.",
  },
  businessImpact: {
    CUSTOMER_CHURN: "We lose about 3,000 customers per month, roughly €90k in monthly recurring revenue.",
    SALES_PERFORMANCE: "Missed targets are noticed too late to react, costing an estimated 4% of quarterly revenue.",
    NETWORK_PERFORMANCE: "Each major outage leads to around 500 complaints and potential SLA penalties.",
    GENERIC_ANALYTICS: "The manual work takes about 30 hours per month and delays decisions by a week.",
  },
  desiredOutcome: {
    CUSTOMER_CHURN: "Reduce postpaid churn by identifying at-risk customers early enough for retention offers.",
    SALES_PERFORMANCE: "Enable regional managers to react within the month when a store falls behind its target.",
    NETWORK_PERFORMANCE: "Detect degrading cells before customers complain and prioritize field maintenance.",
    GENERIC_ANALYTICS: "Make consistent figures available to decision makers without manual preparation.",
  },
  expectedValue: {
    CUSTOMER_CHURN: "Retaining 10% of at-risk customers would save around €100k per year.",
    SALES_PERFORMANCE: "Recovering half of the missed target would add about 2% quarterly revenue.",
    NETWORK_PERFORMANCE: "Fewer complaints and an estimated 20% reduction in emergency field visits.",
    GENERIC_ANALYTICS: "About 30 hours of analyst time saved per month.",
  },
  requestingStakeholder: {
    CUSTOMER_CHURN: "The Head of Customer Retention, B2C.",
    SALES_PERFORMANCE: "The Sales Director for the retail channel.",
    NETWORK_PERFORMANCE: "Network Operations management.",
    GENERIC_ANALYTICS: "The Finance controlling team.",
  },
  intendedUsers: {
    CUSTOMER_CHURN: "Retention campaign managers and customer care team leads.",
    SALES_PERFORMANCE: "Regional sales managers and store managers.",
    NETWORK_PERFORMANCE: "Network operations engineers and regional network planners.",
    GENERIC_ANALYTICS: "Department heads and the controlling team.",
  },
  analyticalCapability: {
    CUSTOMER_CHURN: "Identify customers with a high churn risk and compare churn by tariff and region.",
    SALES_PERFORMANCE: "Compare actual sales to targets per store and drill down by product.",
    NETWORK_PERFORMANCE: "Monitor dropped-call rates per cell and detect unusual trends.",
    GENERIC_ANALYTICS: "Track the main figures over time and compare them between departments.",
  },
  expectedOutput: {
    CUSTOMER_CHURN: "A weekly list of at-risk customers plus a summary dashboard.",
    SALES_PERFORMANCE: "A dashboard with target achievement per region and store.",
    NETWORK_PERFORMANCE: "A dashboard with cell-level KPIs and an alert for threshold breaches.",
    GENERIC_ANALYTICS: "A monthly PDF report.",
  },
  usageFrequency: {
    CUSTOMER_CHURN: "Weekly, before the retention campaign planning meeting.",
    SALES_PERFORMANCE: "Daily during the month, with a monthly review.",
    NETWORK_PERFORMANCE: "Hourly updates, reviewed daily by the operations team.",
    GENERIC_ANALYTICS: "Monthly.",
  },
  dataSources: {
    CUSTOMER_CHURN: "CRM contract data and billing data.",
    SALES_PERFORMANCE: "CRM sales orders and the sales target spreadsheet from controlling.",
    NETWORK_PERFORMANCE: "OSS performance counters and the customer complaint ticketing system.",
    GENERIC_ANALYTICS: "The data warehouse finance tables.",
  },
  dataElements: {
    CUSTOMER_CHURN: "Customer ID, tariff, contract start and end date, region, monthly usage.",
    SALES_PERFORMANCE: "Orders, products, store, sales channel, order date, revenue.",
    NETWORK_PERFORMANCE: "Cell ID, site, region, dropped calls, call attempts, timestamp.",
    GENERIC_ANALYTICS: "Department, cost centre, month, amount.",
  },
  reportingPeriod: {
    CUSTOMER_CHURN: "The last 24 months, updated on a rolling basis.",
    SALES_PERFORMANCE: "The current fiscal year compared with the previous year.",
    NETWORK_PERFORMANCE: "The last 90 days.",
    GENERIC_ANALYTICS: "Since January 2024.",
  },
  dataGranularity: {
    CUSTOMER_CHURN: "Customer-level data, aggregated monthly for reporting.",
    SALES_PERFORMANCE: "Per store and per day.",
    NETWORK_PERFORMANCE: "Per cell and per hour.",
    GENERIC_ANALYTICS: "Per department and month.",
  },
  keyMetrics: {
    CUSTOMER_CHURN: "Monthly churn rate, number of cancellations, churn rate by tariff.",
    SALES_PERFORMANCE: "Revenue, target achievement in %, conversion rate.",
    NETWORK_PERFORMANCE: "Dropped-call rate, average latency, cell availability.",
    GENERIC_ANALYTICS: "Total cost per department and month-over-month change.",
  },
  successCriteria: {
    CUSTOMER_CHURN: "Reduce monthly postpaid churn from 1.8% to below 1.5% within six months.",
    SALES_PERFORMANCE: "At least 95% target achievement in every region.",
    NETWORK_PERFORMANCE: "Dropped-call rate below 0.5% in all regions.",
    GENERIC_ANALYTICS: "Reporting effort reduced by 80%.",
  },
  acceptanceConditions: {
    CUSTOMER_CHURN: "The list must be available every Monday by 9:00 and include all active postpaid customers.",
    SALES_PERFORMANCE: "Figures must match the official monthly sales report and refresh daily.",
    NETWORK_PERFORMANCE: "All cells must be included and the data must be no older than two hours.",
    GENERIC_ANALYTICS: "The report must be signed off by the controlling team.",
  },
  validationCriteria: {
    CUSTOMER_CHURN: "Compare churn figures against the finance churn report; deviation below 1%.",
    SALES_PERFORMANCE: "Reconcile revenue with the ERP monthly close for one sample month.",
    NETWORK_PERFORMANCE: "Cross-check cell KPIs against the OSS for a sample of 20 cells.",
    GENERIC_ANALYTICS: "The controlling team reviews one month against the existing manual report.",
  },
};

// ─── Question templates ─────────────────────────────────────────────────────

export function sectionPositionOf(field: RequirementFieldKey): { index: number; title: string } {
  const index = BRD_SECTIONS.findIndex((section) => section.fields.some((f) => f.key === field));
  return { index: index + 1, title: BRD_SECTIONS[index]?.title ?? "" };
}

function documentPrefix(profile: RoleProfile, field: RequirementFieldKey): string {
  if (!profile.showDocumentProgress) return "";
  const { index, title } = sectionPositionOf(field);
  return `Section ${index} of ${BRD_SECTIONS.length} · ${title}. `;
}

export interface QuestionContext {
  profile: RoleProfile;
  scenario: Scenario;
  proposedSolution: string | null;
}

export function initialQuestion(field: RequirementFieldKey, context: QuestionContext): string {
  const base = context.profile.questionOverrides[field] ?? DEFAULT_QUESTIONS[field];
  let question = base;
  if (field === "expectedOutput" && context.proposedSolution) {
    question = `You initially asked for a ${context.proposedSolution}. ${base} Is the ${context.proposedSolution} still the right deliverable, or would something else serve the outcome better?`;
  }
  return `${documentPrefix(context.profile, field)}${question}`;
}

/** The mandatory XY-problem question that follows every initial request. */
export function problemValidationQuestion(context: QuestionContext): string {
  if (context.proposedSolution) {
    return `Before we define the ${context.proposedSolution}: what business problem are you trying to solve with it, and what decision would the information help you make?`;
  }
  return DEFAULT_QUESTIONS.problemStatement;
}

const UNCLEAR_EXPLANATIONS: Record<UnclearReason, (field: RequirementFieldKey) => string> = {
  NON_ANSWER: (field) => `That's fine if the ${fieldName(field)} isn't known yet.`,
  TOO_VAGUE: (field) => `I couldn't find a specific ${fieldName(field)} in that answer.`,
  SOLUTION_NOT_PROBLEM: () =>
    "That describes a possible solution rather than the business problem behind it. A dashboard or report is a way to address a problem, so I need to understand the problem first.",
  SOLUTION_NOT_OUTCOME: () =>
    "That describes a deliverable rather than a business outcome. The outcome is what should change for the business once the deliverable is in use.",
};

export function unclearExplanation(field: RequirementFieldKey, reason: UnclearReason): string {
  return UNCLEAR_EXPLANATIONS[reason](field);
}

export function clarificationQuestion(
  field: RequirementFieldKey,
  context: QuestionContext,
  options: { returning: boolean },
): string {
  const opening = options.returning ? `Let's return to the ${fieldName(field)}, which still needs clarification. ` : "";
  const question = context.profile.questionOverrides[field] ?? DEFAULT_QUESTIONS[field];
  return `${documentPrefix(context.profile, field)}${opening}${question} For example: “${FIELD_EXAMPLES[field][context.scenario]}” If this isn't known yet, reply “skip” and it will be marked as incomplete.`;
}

export function repeatQuestion(question: string): string {
  return `To continue: ${question}`;
}

// ─── Acknowledgements and notes ─────────────────────────────────────────────

export function scenarioNote(classification: ClassificationResult): string {
  if (classification.scenario === "GENERIC_ANALYTICS") {
    return "I didn't find keywords for one of my specific discovery scenarios, so I'll use the general analytics scenario.";
  }
  const terms = classification.matchedTerms.map((term) => `“${term}”`).join(", ");
  return `Based on the keywords in your request (${terms}), I'll use the ${SCENARIO_LABELS[classification.scenario]} scenario.`;
}

export const recordedNote = (field: RequirementFieldKey, value: string) =>
  endSentence(`I've recorded the ${fieldName(field)}: ${quoted(value)}`);

export const statementNote = (field: RequirementFieldKey, value: string) =>
  endSentence(`I've also recorded the ${fieldName(field)}: ${quoted(value)}`);

export const correctionNote = (field: RequirementFieldKey, value: string) =>
  endSentence(`I've updated the ${fieldName(field)} to ${quoted(value)}`);

export const statementConflictNote = (field: RequirementFieldKey, existing: string) =>
  `The ${fieldName(field)} is already recorded as ${quoted(existing)}, so I haven't changed it. To replace it, say for example “Change the ${FIELD_RULES[field].aliases.strong[0] ?? fieldName(field)} to …”.`;

export const deferredNote = (field: RequirementFieldKey, reason: UnclearReason) =>
  `${unclearExplanation(field, reason)} I've marked the ${fieldName(field)} as needing clarification and will come back to it.`;

export const skippedByUserNote = (field: RequirementFieldKey) =>
  `I've skipped the ${fieldName(field)} and marked it as incomplete. You can add it later, for example ${statementHint(field)}`;

export const skippedAfterClarificationNote = (field: RequirementFieldKey) =>
  `I still couldn't identify a specific ${fieldName(field)}, so I've marked it as skipped (incomplete). You can add it later, for example ${statementHint(field)}`;

export const AMBIGUOUS_CORRECTION_NOTES = {
  NO_FIELD:
    "I'm not sure which requirement you want to change, so I haven't changed anything. Please name it, for example “Change the data source to …” or “Actually, the KPI should be …”.",
  MULTIPLE_FIELDS:
    "That names more than one requirement, so I haven't changed anything. Please correct one requirement per message, for example “Change the target users to …”.",
  UNUSABLE_VALUE:
    "I couldn't find a new value in that correction, so I haven't changed anything. Please include the new value, for example “Change the reporting period to the last 12 months”.",
} as const;

export function completenessNote(completed: number, percentage: number): string {
  return `Completeness: ${percentage}% (${completed} of ${TOTAL_REQUIRED_FIELDS} required fields).`;
}

// ─── Review and BRD stage ───────────────────────────────────────────────────

const STATUS_TEXT: Record<Exclude<FieldStatus, "PROVIDED">, string> = {
  MISSING: "Not specified",
  NEEDS_CLARIFICATION: "Not specified (needs clarification)",
  SKIPPED: "Not specified (skipped)",
};

export function requirementsSummary(fields: RequirementFields): string {
  return BRD_SECTIONS.map((section) => {
    const lines = section.fields.map(({ key, label }) => {
      const field = fields[key];
      const text = field.status === FieldStatus.PROVIDED && field.value ? quoted(field.value) : STATUS_TEXT[field.status as Exclude<FieldStatus, "PROVIDED">];
      return `• ${label}: ${text}`;
    });
    return [section.title, ...lines].join("\n");
  }).join("\n\n");
}

export function reviewMessage(fields: RequirementFields, completed: number, percentage: number): string {
  return [
    `Thank you — every requirement has now been addressed. Here is the summary (${completed} of ${TOTAL_REQUIRED_FIELDS} required fields complete, ${percentage}%):`,
    requirementsSummary(fields),
    "Please confirm that this is correct (for example “Looks good”), or tell me what to change, for example “Change the data source to …”.",
  ].join("\n\n");
}

export const REVIEW_PROMPT =
  "Please confirm the summary (for example “Looks good”), or name the requirement to change, for example “Change the data source to …” or “The reporting period is …”.";

export function brdReadyMessage(incomplete: readonly RequirementFieldKey[]): string {
  if (incomplete.length === 0) {
    return `Thank you for confirming. All ${TOTAL_REQUIRED_FIELDS} required fields are complete, so the requirements are ready for a BRD. Use “Generate BRD” to create the document.`;
  }
  const names = incomplete.map((field) => FIELD_LABELS[field]).join("; ");
  const count = incomplete.length === 1 ? "1 required field is" : `${incomplete.length} of ${TOTAL_REQUIRED_FIELDS} required fields are`;
  return `Thank you for confirming. ${count} still incomplete: ${names}. You can still use “Generate BRD” to create a draft; missing information will be shown as “Not specified”.`;
}

export const BRD_STAGE_PROMPT =
  "The requirements are ready for the BRD. Use “Generate BRD”, or tell me what to change, for example “Change the KPI to …”.";
