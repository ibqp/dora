/**
 * DORA Mock AI — deterministic, rule-based discovery engine. No LLM or external AI service.
 * Public entry points for the API layer.
 */
export { processTurn } from "./engine";
export { classifyScenario } from "./classification";
export { createInitialDiscoveryState, discoveryStateSchema } from "./state";
export {
  buildRequirementsProgress,
  getStageProgress,
  type RequirementFieldProgress,
  type RequirementSectionProgress,
  type RequirementsProgress,
  type StageProgress,
} from "./progress";
export { DISCOVERY_STAGE_LABELS, DISCOVERY_STAGE_ORDER } from "./state-machine";
export { ROLE_PROFILES, getRoleProfile } from "./roles";
export { SCENARIO_LABELS } from "./config/scenarios";
export type { DiscoveryState, EngineEvent, EngineInput, EngineResult } from "./types";
