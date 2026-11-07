// Barrel of the synthetic adapter. Imported only by dev/test assembly and tests, never by production code.
export { createSyntheticSourceReadPort, SYNTHETIC_LABEL, SYNTHETIC_SOURCE_OWNER } from './synthetic-adapter.js';
export type { SyntheticFile, SyntheticFixture, SyntheticLine, SyntheticPeriod } from './synthetic-adapter.js';
export { createSyntheticScenario, sampleSetOf, SYNTHETIC_LEAK_MARKER, SYNTHETIC_SCENARIOS, syntheticFixture } from './scenarios.js';
export type { SyntheticScenario } from './scenarios.js';
