/**
 * Catalog of the seven BRD sections and their 18 required fields (MASTER_SPEC.md §5).
 * This is the single source of truth for field keys, labels and section membership.
 */

export const BRD_SECTIONS = [
  {
    key: "businessProblem",
    title: "Business Problem",
    fields: [
      { key: "problemStatement", label: "Problem statement" },
      { key: "currentSituation", label: "Current situation" },
      { key: "businessImpact", label: "Business impact" },
    ],
  },
  {
    key: "businessObjectives",
    title: "Business Objectives",
    fields: [
      { key: "desiredOutcome", label: "Desired business outcome" },
      { key: "expectedValue", label: "Expected business value" },
    ],
  },
  {
    key: "stakeholders",
    title: "Stakeholders",
    fields: [
      { key: "requestingStakeholder", label: "Requesting stakeholder or business unit" },
      { key: "intendedUsers", label: "Intended users of the analytical output" },
    ],
  },
  {
    key: "functionalRequirements",
    title: "Functional Requirements",
    fields: [
      { key: "analyticalCapability", label: "Required analytical capability" },
      { key: "expectedOutput", label: "Expected output or deliverable" },
      { key: "usageFrequency", label: "Usage or reporting frequency" },
    ],
  },
  {
    key: "dataRequirements",
    title: "Data Requirements",
    fields: [
      { key: "dataSources", label: "Data sources" },
      { key: "dataElements", label: "Required data elements or entities" },
      { key: "reportingPeriod", label: "Reporting period or time range" },
      { key: "dataGranularity", label: "Data granularity" },
    ],
  },
  {
    key: "kpis",
    title: "KPIs and Success Metrics",
    fields: [
      { key: "keyMetrics", label: "Key business metrics" },
      { key: "successCriteria", label: "Success criteria or target outcomes" },
    ],
  },
  {
    key: "acceptanceCriteria",
    title: "Acceptance Criteria",
    fields: [
      { key: "acceptanceConditions", label: "Conditions for accepting the deliverable" },
      { key: "validationCriteria", label: "Expected validation or verification criteria" },
    ],
  },
] as const;

export type BrdSection = (typeof BRD_SECTIONS)[number];
export type BrdSectionKey = BrdSection["key"];
export type RequirementFieldKey = BrdSection["fields"][number]["key"];

export interface RequirementFieldDefinition {
  key: RequirementFieldKey;
  label: string;
  section: BrdSectionKey;
}

export const REQUIREMENT_FIELDS: readonly RequirementFieldDefinition[] = BRD_SECTIONS.flatMap(
  (section) =>
    section.fields.map((field) => ({ key: field.key, label: field.label, section: section.key })),
);

export const REQUIREMENT_FIELD_KEYS = REQUIREMENT_FIELDS.map((field) => field.key) as [
  RequirementFieldKey,
  ...RequirementFieldKey[],
];

export const TOTAL_REQUIRED_FIELDS = REQUIREMENT_FIELDS.length;

export const FieldStatus = {
  MISSING: "MISSING",
  PROVIDED: "PROVIDED",
  NEEDS_CLARIFICATION: "NEEDS_CLARIFICATION",
  SKIPPED: "SKIPPED",
} as const;

export type FieldStatus = (typeof FieldStatus)[keyof typeof FieldStatus];

export const FIELD_STATUSES = Object.values(FieldStatus) as [FieldStatus, ...FieldStatus[]];
