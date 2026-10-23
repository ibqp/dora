/**
 * DORA discovery engine: one pure function per conversation turn.
 *
 * processTurn(message, state, role) → next state + reply. No I/O, no clock, no randomness:
 * the same input always produces the same result. Persistence is the caller's job.
 */
import { DiscoveryStage, type Scenario } from "@/generated/prisma/enums";
import { FieldStatus, type RequirementFieldKey } from "@/lib/requirements/fields";
import { calculateRequirementsCompleteness, countCompletedFields, listIncompleteFields } from "@/lib/requirements/progress";

import { classifyScenario } from "./classification";
import { MAX_CLARIFICATION_ATTEMPTS } from "./config/fields";
import { detectCorrection, evaluateAnswer, extractStatements, removeStatements, type ExtractedStatement } from "./extraction";
import { isConfirmation, isSkipRequest } from "./intents";
import { getRoleProfile, type RoleProfile } from "./roles";
import { detectProposedSolution } from "./solution-detection";
import { clarifiesImmediately, resolveNextStep, type NextStep } from "./state-machine";
import {
  AMBIGUOUS_CORRECTION_NOTES,
  BRD_STAGE_PROMPT,
  brdReadyMessage,
  clarificationQuestion,
  completenessNote,
  correctionNote,
  deferredNote,
  initialQuestion,
  problemValidationQuestion,
  recordedNote,
  repeatQuestion,
  REVIEW_PROMPT,
  reviewMessage,
  scenarioNote,
  skippedAfterClarificationNote,
  skippedByUserNote,
  statementConflictNote,
  statementNote,
  unclearExplanation,
  type QuestionContext,
} from "./templates";
import { normalizeText } from "./text";
import type { DiscoveryState, EngineEvent, EngineInput, EngineResult, QuestionKind, UnclearReason } from "./types";

/** Mutable working data for one turn. */
interface Turn {
  state: DiscoveryState;
  profile: RoleProfile;
  events: EngineEvent[];
  notes: string[];
  /** Whether the message was evaluated as an answer to the field DORA asked about. */
  answeredCurrentField: boolean;
  /** Set when fields changed in a way worth reporting (BRD Generator progress note). */
  fieldsChanged: boolean;
}

function sameValue(a: string, b: string): boolean {
  return normalizeText(a).toLowerCase() === normalizeText(b).toLowerCase();
}

function provideField(turn: Turn, field: RequirementFieldKey, value: string, source: "ANSWER" | "STATEMENT") {
  const target = turn.state.fields[field];
  target.value = value;
  target.status = FieldStatus.PROVIDED;
  turn.events.push({ type: "FIELD_PROVIDED", field, value, source });
  turn.fieldsChanged = true;
}

/** Applies an explicitly named value. Never overwrites a provided field unless it is a correction. */
function applyExplicitValue(turn: Turn, field: RequirementFieldKey, value: string, mode: "statement" | "correction") {
  const target = turn.state.fields[field];
  if (target.status === FieldStatus.PROVIDED && target.value !== null) {
    if (sameValue(target.value, value)) return;
    if (mode === "statement") {
      turn.events.push({ type: "STATEMENT_CONFLICT", field, existingValue: target.value, statedValue: value });
      turn.notes.push(statementConflictNote(field, target.value));
      return;
    }
    turn.events.push({ type: "FIELD_CORRECTED", field, previousValue: target.value, value });
    target.value = value;
    turn.fieldsChanged = true;
    turn.notes.push(correctionNote(field, value));
    return;
  }
  provideField(turn, field, value, "STATEMENT");
  turn.notes.push(mode === "correction" ? recordedNote(field, value) : statementNote(field, value));
}

function applyStatements(turn: Turn, statements: readonly ExtractedStatement[]) {
  for (const statement of statements) applyExplicitValue(turn, statement.field, statement.value, "statement");
}

function handleUnclearAnswer(turn: Turn, field: RequirementFieldKey, reason: UnclearReason) {
  const target = turn.state.fields[field];
  if (target.clarificationCount >= MAX_CLARIFICATION_ATTEMPTS) {
    target.status = FieldStatus.SKIPPED;
    turn.events.push({ type: "FIELD_SKIPPED", field, reason: "MAX_CLARIFICATIONS" });
    turn.notes.push(skippedAfterClarificationNote(field));
    return;
  }
  target.status = FieldStatus.NEEDS_CLARIFICATION;
  turn.events.push({ type: "FIELD_NEEDS_CLARIFICATION", field, reason });
  turn.notes.push(
    clarifiesImmediately(turn.state.stage) ? unclearExplanation(field, reason) : deferredNote(field, reason),
  );
}

/** Processes a reply in the validation, discovery and clarification stages. */
function handleFieldAnswer(turn: Turn, message: string, cueOnly: boolean) {
  const field = turn.state.currentField;
  const statements = extractStatements(message);
  if (!field) {
    applyStatements(turn, statements);
    return;
  }

  if (isSkipRequest(message)) {
    turn.state.fields[field].status = FieldStatus.SKIPPED;
    turn.events.push({ type: "FIELD_SKIPPED", field, reason: "USER_REQUEST" });
    turn.notes.push(skippedByUserNote(field));
    turn.answeredCurrentField = true;
    turn.fieldsChanged = true;
    return;
  }

  const own = statements.find((statement) => statement.field === field);
  const others = statements.filter((statement) => statement.field !== field);
  // Statements about other fields are recorded separately and not repeated in this answer.
  const answer = own ? own.value : removeStatements(message, others);
  const evaluation = evaluateAnswer(field, answer);

  if (evaluation.kind === "clear") {
    provideField(turn, field, evaluation.value, "ANSWER");
    turn.notes.push(recordedNote(field, evaluation.value));
    turn.answeredCurrentField = true;
  } else if (others.length > 0) {
    // The message was about other fields; the current question is repeated without penalty.
  } else if (cueOnly) {
    turn.events.push({ type: "CORRECTION_AMBIGUOUS", reason: "NO_FIELD" });
    turn.notes.push(AMBIGUOUS_CORRECTION_NOTES.NO_FIELD);
  } else {
    handleUnclearAnswer(turn, field, evaluation.reason);
    turn.answeredCurrentField = true;
  }
  applyStatements(turn, others);
}

function questionContext(turn: Turn): QuestionContext {
  return {
    profile: turn.profile,
    scenario: (turn.state.scenario ?? "GENERIC_ANALYTICS") as Scenario,
    proposedSolution: turn.state.proposedSolution,
  };
}

/** Chooses how to ask about the next field and updates its clarification counter. */
function askNextField(turn: Turn, field: RequirementFieldKey, previousField: RequirementFieldKey | null): string {
  const context = questionContext(turn);
  const target = turn.state.fields[field];
  const isRepeat = field === previousField && !turn.answeredCurrentField;
  const needsClarification = target.status === FieldStatus.NEEDS_CLARIFICATION;

  let question: string;
  if (needsClarification) {
    question = clarificationQuestion(field, context, { returning: field !== previousField });
    if (!isRepeat) target.clarificationCount += 1;
  } else {
    question = field === "problemStatement" ? problemValidationQuestion(context) : initialQuestion(field, context);
  }

  const kind: QuestionKind = isRepeat ? "REPEAT" : needsClarification ? "CLARIFICATION" : "INITIAL";
  turn.events.push({ type: "QUESTION_ASKED", field, kind });
  return isRepeat ? repeatQuestion(question) : question;
}

function composeReply(turn: Turn, closing: string): string {
  const notes = [...turn.notes];
  if (turn.profile.showDocumentProgress && turn.fieldsChanged) {
    notes.push(completenessNote(countCompletedFields(turn.state.fields), calculateRequirementsCompleteness(turn.state.fields)));
  }
  return [notes.join(" "), closing].filter((part) => part.length > 0).join("\n\n");
}

function finishTurn(turn: Turn, previous: DiscoveryState, next: NextStep, confirmed: boolean): EngineResult {
  const { state } = turn;
  state.stage = next.stage;
  state.currentField = next.field;
  if (previous.stage !== state.stage) {
    turn.events.push({ type: "STAGE_CHANGED", from: previous.stage, to: state.stage });
  }

  let closing: string;
  let suggestBrd = false;
  if (next.field) {
    closing = askNextField(turn, next.field, previous.currentField);
  } else if (state.stage === DiscoveryStage.REQUIREMENTS_REVIEW) {
    const completed = countCompletedFields(state.fields);
    const percentage = calculateRequirementsCompleteness(state.fields);
    if (previous.stage !== DiscoveryStage.REQUIREMENTS_REVIEW) {
      closing = reviewMessage(state.fields, completed, percentage);
    } else {
      closing = turn.notes.length > 0 ? "Is everything else correct? Reply “Looks good” to continue." : REVIEW_PROMPT;
    }
  } else {
    // BRD_GENERATION
    suggestBrd = true;
    if (confirmed) {
      turn.events.push({ type: "REQUIREMENTS_CONFIRMED" });
      closing = brdReadyMessage(listIncompleteFields(state.fields));
    } else {
      closing = BRD_STAGE_PROMPT;
    }
  }

  return {
    state,
    reply: composeReply(turn, closing),
    completenessPercentage: calculateRequirementsCompleteness(state.fields),
    suggestBrd,
    events: turn.events,
  };
}

function processInitialRequest(turn: Turn, message: string, previous: DiscoveryState): EngineResult {
  const classification = classifyScenario(message);
  turn.state.scenario = classification.scenario;
  turn.events.push({ type: "SCENARIO_CLASSIFIED", classification });

  const solution = detectProposedSolution(message);
  turn.state.proposedSolution = solution;
  if (solution) turn.events.push({ type: "PROPOSED_SOLUTION_DETECTED", solution });

  turn.notes.push(scenarioNote(classification), turn.profile.introduction);
  // Mandatory XY-problem validation: problem and objective fields are never taken from the
  // initial request; they are always asked for explicitly.
  const statements = extractStatements(message).filter(
    (statement) => !turn.profile.validationFields.includes(statement.field),
  );
  applyStatements(turn, statements);

  const next = resolveNextStep(turn.state.fields, DiscoveryStage.INITIAL_REQUEST, turn.profile.role);
  return finishTurn(turn, previous, next, false);
}

export function processTurn(input: EngineInput): EngineResult {
  const message = normalizeText(input.message);
  const previous = input.state;
  const turn: Turn = {
    state: structuredClone(input.state),
    profile: getRoleProfile(input.role),
    events: [],
    notes: [],
    answeredCurrentField: false,
    fieldsChanged: false,
  };

  if (previous.stage === DiscoveryStage.INITIAL_REQUEST) {
    return processInitialRequest(turn, message, previous);
  }

  let confirmed = false;
  const correction = detectCorrection(message);
  const inFinalStages =
    previous.stage === DiscoveryStage.REQUIREMENTS_REVIEW || previous.stage === DiscoveryStage.BRD_GENERATION;

  if (correction.kind === "correction") {
    applyExplicitValue(turn, correction.field, correction.value, "correction");
    if (correction.field === previous.currentField) turn.answeredCurrentField = true;
  } else if (correction.kind === "ambiguous") {
    turn.events.push({ type: "CORRECTION_AMBIGUOUS", reason: correction.reason });
    turn.notes.push(AMBIGUOUS_CORRECTION_NOTES[correction.reason]);
  } else if (inFinalStages) {
    const statements = extractStatements(message);
    if (statements.length > 0) {
      applyStatements(turn, statements);
    } else if (previous.stage === DiscoveryStage.REQUIREMENTS_REVIEW && isConfirmation(message)) {
      confirmed = true;
    } else if (correction.kind === "cue-only") {
      turn.events.push({ type: "CORRECTION_AMBIGUOUS", reason: "NO_FIELD" });
      turn.notes.push(AMBIGUOUS_CORRECTION_NOTES.NO_FIELD);
    }
  } else {
    handleFieldAnswer(turn, message, correction.kind === "cue-only");
  }

  const next: NextStep = confirmed
    ? { stage: DiscoveryStage.BRD_GENERATION, field: null }
    : resolveNextStep(turn.state.fields, previous.stage, input.role);
  return finishTurn(turn, previous, next, confirmed);
}
