/** Simulated "DORA is typing" delay. Kept in its own module so tests can replace it. */
export function simulateResponseDelay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}
