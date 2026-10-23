/**
 * The four predefined DORA roles (MASTER_SPEC.md §4). Roles do not change the engine or the
 * collected requirements; they change which fields are validated first, the order of questions
 * and the wording of templates.
 */
import { AssistantRole } from "@/generated/prisma/enums";
import { REQUIREMENT_FIELD_KEYS, type RequirementFieldKey } from "@/lib/requirements/fields";

export interface RoleProfile {
  role: AssistantRole;
  label: string;
  /** Short description for role selection in the UI. */
  summary: string;
  /** One sentence shown with the first reply. */
  introduction: string;
  /** Fields that must be resolved during Business Problem Validation (always includes the problem). */
  validationFields: readonly RequirementFieldKey[];
  /** Question order for all 18 fields in the discovery and clarification stages. */
  fieldPriority: readonly RequirementFieldKey[];
  /** Role-specific wording for selected questions. */
  questionOverrides: Partial<Record<RequirementFieldKey, string>>;
  /** Prefix questions with the BRD section and report completeness after each answer. */
  showDocumentProgress: boolean;
}

const CORE_VALIDATION: readonly RequirementFieldKey[] = ["problemStatement", "desiredOutcome"];

export const ROLE_PROFILES: Record<AssistantRole, RoleProfile> = {
  REQUIREMENTS_DISCOVERY: {
    role: AssistantRole.REQUIREMENTS_DISCOVERY,
    label: "Requirements Discovery Assistant",
    summary: "Balanced requirements elicitation (default).",
    introduction: "I'll guide you through the requirements step by step, starting with the business problem.",
    validationFields: CORE_VALIDATION,
    fieldPriority: REQUIREMENT_FIELD_KEYS,
    questionOverrides: {},
    showDocumentProgress: false,
  },
  XY_PROBLEM_DIAGNOSTIC: {
    role: AssistantRole.XY_PROBLEM_DIAGNOSTIC,
    label: "XY-Problem Diagnostic Agent",
    summary: "Focuses on the problem, motivation and expected outcome first.",
    introduction:
      "I'll focus on the problem and the motivation behind the request first, because the requested solution may not be the only way to address it.",
    validationFields: ["problemStatement", "currentSituation", "businessImpact", "desiredOutcome", "expectedValue"],
    fieldPriority: [
      "problemStatement", "currentSituation", "businessImpact", "desiredOutcome", "expectedValue",
      "requestingStakeholder", "intendedUsers", "keyMetrics", "successCriteria", "analyticalCapability",
      "expectedOutput", "usageFrequency", "dataSources", "dataElements", "reportingPeriod",
      "dataGranularity", "acceptanceConditions", "validationCriteria",
    ],
    questionOverrides: {
      currentSituation: "What happens today because of this problem, and how do you currently work around it?",
      businessImpact: "What does this problem cost the business today — for example in revenue, customers, time or risk?",
      desiredOutcome:
        "If this problem were solved, what would be different for the business? Please describe the outcome, not the deliverable.",
      expectedValue: "Why does that outcome matter? What value would it create, and how would you notice it?",
      expectedOutput:
        "Now that the problem and the outcome are clear: which deliverable would best support that outcome?",
    },
    showDocumentProgress: false,
  },
  DATA_REQUIREMENTS_ANALYST: {
    role: AssistantRole.DATA_REQUIREMENTS_ANALYST,
    label: "Data Requirements Analyst",
    summary: "Focuses on KPIs, data sources, data elements and granularity.",
    introduction:
      "After confirming the business problem, I'll focus on KPIs, data sources, data elements and granularity.",
    validationFields: CORE_VALIDATION,
    fieldPriority: [
      "problemStatement", "desiredOutcome", "keyMetrics", "dataSources", "dataElements",
      "dataGranularity", "reportingPeriod", "successCriteria", "analyticalCapability", "usageFrequency",
      "expectedOutput", "intendedUsers", "requestingStakeholder", "currentSituation", "businessImpact",
      "expectedValue", "acceptanceConditions", "validationCriteria",
    ],
    questionOverrides: {
      keyMetrics: "Which KPIs should be calculated, and how is each one defined (for example numerator and denominator)?",
      dataSources:
        "Which source systems hold the required data (for example CRM, billing or a data warehouse)? Please name only systems you know contain it.",
      dataElements: "Which entities and attributes are required (for example customer ID, contract start date, tariff)?",
      dataGranularity: "What grain does the data need — one record per customer, per contract, per day, per cell?",
      reportingPeriod: "How much history is needed, and which time range should the reporting cover?",
    },
    showDocumentProgress: false,
  },
  BRD_GENERATOR: {
    role: AssistantRole.BRD_GENERATOR,
    label: "BRD Generator",
    summary: "Follows the BRD structure and reports document completeness.",
    introduction:
      "I'll collect the requirements section by section in BRD order and keep track of document completeness.",
    validationFields: CORE_VALIDATION,
    fieldPriority: REQUIREMENT_FIELD_KEYS,
    questionOverrides: {},
    showDocumentProgress: true,
  },
};

export function getRoleProfile(role: AssistantRole): RoleProfile {
  return ROLE_PROFILES[role];
}
