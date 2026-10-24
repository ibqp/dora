/**
 * Bounds of the shared demo settings (MASTER_SPEC.md §9). The upper delay bound stays far below
 * the session processing-lock timeout, so a slow simulated reply can never lose its lock.
 * The database enforces the same range with a CHECK constraint.
 */
export const DEFAULT_RESPONSE_DELAY_MS = 1500;
export const MIN_RESPONSE_DELAY_MS = 0;
export const MAX_RESPONSE_DELAY_MS = 5000;
/** Granularity offered by the settings form; the API accepts any whole number in range. */
export const RESPONSE_DELAY_STEP_MS = 100;
