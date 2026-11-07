// log-explorer module barrel (#1467 node a: port, contract, guard, domain, skeleton). No endpoints, tables or migrations yet (nodes b/c).
// This barrel must never import `adapters/synthetic/` or `testing/`: the production graph check fails if it does (ADR-0009 approach).

import type { LogExplorerDeps } from './deps.js';
import { guardSourceReadPort } from './ports/guarded.js';
import type { SourceReadPort } from './ports/source-read.js';

export interface LogExplorerModule {
  /** The injected adapter behind the guard: every read the module makes goes through this, never through the raw adapter. */
  sourceRead: SourceReadPort;
}

export function createLogExplorerModule(deps: LogExplorerDeps): LogExplorerModule {
  return { sourceRead: guardSourceReadPort(deps.sourceReadPort) };
}

export type { LifecycleRead, LogExplorerDeps } from './deps.js';
export { SOURCE_READ_ERROR_CODES, SourceReadError, toSourceReadError } from './errors.js';
export type { SourceReadErrorCode } from './errors.js';
export { EVIDENCE_NOTE_MAX, EVIDENCE_REFS_MAX, normalizeEvidenceRef, normalizeEvidenceRefs } from './domain/evidence-ref.js';
export type { EvidenceRef } from './domain/evidence-ref.js';
export { clampRowLimit, clampTimeBudgetMs, clampWindowSide, effectiveLimits, PLATFORM_SOURCE_LIMITS, truncateRowText } from './domain/limits.js';
export { isInSourceOrder, markTimeReversals } from './domain/time-reversal.js';
export { guardSourceReadPort } from './ports/guarded.js';
export type { SourceReadContext, SourceReadPort } from './ports/source-read.js';
