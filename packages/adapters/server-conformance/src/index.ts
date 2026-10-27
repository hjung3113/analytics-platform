/**
 * Server boundary conformance kit (#145, #152). Judges any `PlatformAdapter` implementation — the mock today,
 * the in-house server adapter later — against the menu query contract (docs/integration/real-server-checklist.md,
 * 06 §5·§19) and the port methods beyond menuQuery (checklist §2: session, subscribe, validateScope, getEntity,
 * entityAudit, the console reads, annotations, usage telemetry, client error reports). Every check is derived
 * from a contract declaration plus samples the granted actor can run, so the kit knows no menu and no mock internals.
 */
export type {
  ActionCase, ConformanceCase, ConformanceCheck, ConformanceResult, ConformanceSkipped, OptionPortSamples, PortMethod, PortSamples, ServerConformanceHarness,
} from './types';
export { planServerConformance } from './plan/endpoints';
export { describeServerConformance, runServerConformance } from './run';
