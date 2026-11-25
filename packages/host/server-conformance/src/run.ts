import { beforeAll, describe, expect, it } from 'vitest';
import type { ConformanceCheck, ConformanceResult, ServerConformanceHarness } from './types';
import { planServerConformance } from './plan/endpoints';

const DEFAULT_CHECK_TIMEOUT_MS = 20_000;
const DEFAULT_SUITE_TIMEOUT_MS = 120_000;
const SUITE_TIMEOUT_MARGIN_MS = 1_000;

function checkTimeout(check: ConformanceCheck, harness: ServerConformanceHarness): number {
  return check.timeoutMs ?? harness.checkTimeoutMs ?? DEFAULT_CHECK_TIMEOUT_MS;
}

/** The deadline bounds how long the runner waits for a result. */
async function withDeadline(check: ConformanceCheck, timeoutMs: number): ReturnType<ConformanceCheck['run']> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<string>(resolve => {
    timer = setTimeout(() => resolve(`did not finish within its check deadline of ${timeoutMs} ms`), timeoutMs);
  });
  try {
    return await Promise.race([check.run(), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/** Runs every planned check: granted checks concurrently as the granted actor, then console checks concurrently as the console actor, then sequential checks one at a time (each switching actors itself), then permission checks one at a time. Skipped checks are not run — they stay visible in the returned list by id. */
export async function runServerConformance(harness: ServerConformanceHarness): Promise<ConformanceResult[]> {
  const checks = planServerConformance(harness);
  const limitations = knownLimitationsOf(harness, checks);
  const failureOf = async (check: ConformanceCheck): Promise<ConformanceResult> => {
    try {
      const failure = await withDeadline(check, checkTimeout(check, harness));
      if (failure !== null && typeof failure === 'object') return { id: check.id, status: 'skipped', failure: null, reason: failure.skipped };
      return { id: check.id, status: failure === null ? 'passed' : 'failed', failure };
    } catch (error) {
      // Envelope methods must answer an envelope even on transport failure (checklist §2); non-envelope methods
      // legitimately reject, so the message names the method throwing instead.
      return {
        id: check.id,
        status: 'failed',
        failure: `${check.nonEnvelope ? 'the adapter threw:' : 'the adapter threw instead of answering an envelope:'} ${String(error)}`,
      };
    }
  };
  const granted = await harness.asGranted(() => Promise.all(checks.filter(c => c.mode === 'granted').map(failureOf)));
  const consoleResults = await harness.asConsole(() => Promise.all(checks.filter(c => c.mode === 'console').map(failureOf)));
  const sequential: ConformanceResult[] = [];
  for (const check of checks.filter(c => c.mode === 'sequential')) sequential.push(await failureOf(check));
  const permission: ConformanceResult[] = [];
  for (const check of checks.filter(c => c.mode === 'permission')) permission.push(await failureOf(check));
  const byId = new Map([...granted, ...consoleResults, ...sequential, ...permission].map(r => [r.id, r]));
  return checks.map(c => {
    if (c.mode === 'skipped') return { id: c.id, status: 'skipped', failure: null };
    const result = byId.get(c.id);
    if (!result) throw new Error(`conformance check planned but not run: ${c.id}`);
    return withKnownLimitation(result, limitations.get(c.baseId ?? c.id));
  });
}

/**
 * The harness's declarations by check id (before a plan-time skip suffix). A blank reason, a repeated declaration, an id
 * no planned check has, or an id more than one planned check shares (skipped ones counted) throws, so a declaration never
 * binds to a check it was not written for (#2894).
 */
export function knownLimitationsOf(harness: ServerConformanceHarness, checks: readonly ConformanceCheck[]): Map<string, string> {
  const planned = new Map<string, number>();
  for (const check of checks) planned.set(check.baseId ?? check.id, (planned.get(check.baseId ?? check.id) ?? 0) + 1);
  const limitations = new Map<string, string>();
  for (const { id, reason } of harness.knownLimitations ?? []) {
    if (!reason?.trim()) throw new Error(`known limitation without a reason: ${id}`);
    if (limitations.has(id)) throw new Error(`known limitation declared twice: ${id}`);
    const matches = planned.get(id) ?? 0;
    if (matches === 0) throw new Error(`known limitation names no planned check: ${id}`);
    if (matches > 1) throw new Error(`known limitation names ${matches} planned checks, so it cannot tell which: ${id}`);
    limitations.set(id, reason);
  }
  return limitations;
}

/** A declared check that failed is a known limitation; one that passed is stale and fails; a skipped one stays not tested. */
function withKnownLimitation(result: ConformanceResult, reason: string | undefined): ConformanceResult {
  if (reason === undefined || result.status === 'skipped') return result;
  if (result.status === 'failed') return { ...result, status: 'known-limitation', reason };
  return { id: result.id, status: 'failed', failure: `declared as a known limitation (${reason}) but passed — remove the declaration` };
}

/**
 * Registers the kit as a vitest suite: one test per check, named by endpoint and rule (sequential checks
 * like every other run check — only `skipped` becomes `it.skip`). The checks run once in `beforeAll`
 * (concurrently where the actor allows, one at a time for sequential/permission checks), then each test
 * reports its own result.
 */
export function describeServerConformance(title: string, harness: ServerConformanceHarness, timeoutMs?: number): void {
  // Validated when the suite is registered, not only in `beforeAll`: a suite whose every check is planned skipped never
  // runs that hook, and an invalid declaration would pass unseen (#2894 review).
  const plan = planServerConformance(harness);
  knownLimitationsOf(harness, plan);
  describe(title, () => {
    let results = new Map<string, ConformanceResult>();
    beforeAll(async () => {
      results = new Map((await runServerConformance(harness)).map(r => [r.id, r]));
    }, timeoutMs ?? suiteTimeout(plan, harness));
    for (const check of plan) {
      if (check.mode === 'skipped') {
        it.skip(check.id, () => {});
        continue;
      }
      it(check.id, ({ skip }) => {
        expect(results.has(check.id), `${check.id} did not run`).toBe(true);
        const result = results.get(check.id)!;
        if (result.status === 'skipped') skip(`— ${result.reason ?? 'skipped at run time'}`);
        // Never a pass: a known limitation shows as a skip that names its reason and the check's failure.
        if (result.status === 'known-limitation') skip(`— known limitation: ${result.reason}; ${result.failure}`);
        expect(result.failure, check.id).toBeNull();
      });
    }
  });
}

/** Allow each serial deadline and the longest deadline in each concurrent batch to expire before the suite times out. */
function suiteTimeout(plan: readonly ConformanceCheck[], harness: ServerConformanceHarness): number {
  let granted = 0;
  let consoleChecks = 0;
  let serial = 0;
  for (const check of plan) {
    if (check.mode === 'skipped') continue;
    const timeout = checkTimeout(check, harness);
    if (check.mode === 'granted') granted = Math.max(granted, timeout);
    else if (check.mode === 'console') consoleChecks = Math.max(consoleChecks, timeout);
    else serial += timeout;
  }
  return Math.max(DEFAULT_SUITE_TIMEOUT_MS, granted + consoleChecks + serial + SUITE_TIMEOUT_MARGIN_MS);
}
