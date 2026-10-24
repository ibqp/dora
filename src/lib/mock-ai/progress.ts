/** Progress views for the UI: field completeness (central calculation) and stage progress. */
import type { DiscoveryStage } from "@/generated/prisma/enums";
import {
  BRD_SECTIONS,
  FieldStatus,
  TOTAL_REQUIRED_FIELDS,
  type BrdSectionKey,
  type RequirementFieldKey,
} from "@/lib/requirements/fields";
import { calculateRequirementsCompleteness, countCompletedFields } from "@/lib/requirements/progress";
import type { RequirementFields } from "@/lib/requirements/schemas";

import { DISCOVERY_STAGE_LABELS, DISCOVERY_STAGE_ORDER, stageIndex } from "./state-machine";

export type StageProgressStatus = "completed" | "current" | "upcoming";

export interface StageProgress {
  stage: DiscoveryStage;
  label: string;
  status: StageProgressStatus;
}

export function getStageProgress(currentStage: DiscoveryStage): StageProgress[] {
  const current = stageIndex(currentStage);
  return DISCOVERY_STAGE_ORDER.map((stage, index) => ({
    stage,
    label: DISCOVERY_STAGE_LABELS[stage],
    status: index < current ? "completed" : index === current ? "current" : "upcoming",
  }));
}

// ─── Requirements progress view ─────────────────────────────────────────────

export interface RequirementFieldProgress {
  key: RequirementFieldKey;
  label: string;
  status: FieldStatus;
  /** Recorded value; only present for PROVIDED fields. */
  value: string | null;
  /** True for the field DORA is currently asking about. */
  isCurrent: boolean;
}

export interface RequirementSectionProgress {
  key: BrdSectionKey;
  title: string;
  completedCount: number;
  totalCount: number;
  fields: RequirementFieldProgress[];
}

export interface RequirementsProgress {
  /** completedCount / totalCount * 100, rounded. Derived from field states only. */
  completenessPercentage: number;
  completedCount: number;
  totalCount: number;
  stage: DiscoveryStage;
  stages: StageProgress[];
  currentField: RequirementFieldKey | null;
  sections: RequirementSectionProgress[];
}

/** Everything the progress panel shows, computed from the structured requirement state. */
export function buildRequirementsProgress(input: {
  stage: DiscoveryStage;
  fields: RequirementFields;
  currentField: RequirementFieldKey | null;
}): RequirementsProgress {
  const sections = BRD_SECTIONS.map((section) => {
    const fields = section.fields.map(({ key, label }) => {
      const field = input.fields[key];
      return {
        key,
        label,
        status: field.status,
        value: field.status === FieldStatus.PROVIDED ? field.value : null,
        isCurrent: key === input.currentField,
      };
    });
    return {
      key: section.key,
      title: section.title,
      completedCount: fields.filter((field) => field.status === FieldStatus.PROVIDED).length,
      totalCount: fields.length,
      fields,
    };
  });

  return {
    completenessPercentage: calculateRequirementsCompleteness(input.fields),
    completedCount: countCompletedFields(input.fields),
    totalCount: TOTAL_REQUIRED_FIELDS,
    stage: input.stage,
    stages: getStageProgress(input.stage),
    currentField: input.currentField,
    sections,
  };
}
