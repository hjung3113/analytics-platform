import { beforeAll, describe, expect, it } from 'vitest';
import type { ConformanceCheck, ConformanceResult, ServerConformanceHarness } from './types';
import { planServerConformance } from './plan/endpoints';

/** `check.run()` under the check's own deadline when it names one; the suite's `beforeAll` timeout still bounds the whole run. */
async function withDeadline(check: ConformanceCheck): ReturnType<ConformanceCheck['run']> {
  if (check.timeoutMs === undefined) return check.run();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<string>(resolve => {
    timer = setTimeout(() => resolve(`did not finish within its own deadline of ${check.timeoutMs} ms`), check.timeoutMs);
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
      const failure = await withDeadline(check);
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
    return withKnownLimitation(result, limitations.get(c.id));
  });
}

/** The harness's declarations by check id. A blank reason, a duplicate id or an id no planned check has throws (#2894). */
function knownLimitationsOf(harness: ServerConformanceHarness, checks: readonly ConformanceCheck[]): Map<string, string> {
  const planned = new Set(checks.map(check => check.id));
  const limitations = new Map<string, string>();
  for (const { id, reason } of harness.knownLimitations ?? []) {
    if (!reason?.trim()) throw new Error(`known limitation without a reason: ${id}`);
    if (limitations.has(id)) throw new Error(`known limitation declared twice: ${id}`);
    if (!planned.has(id)) throw new Error(`known limitation names no planned check: ${id}`);
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
export function describeServerConformance(title: string, harness: ServerConformanceHarness, timeoutMs = 120_000): void {
  describe(title, () => {
    let results = new Map<string, ConformanceResult>();
    beforeAll(async () => {
      results = new Map((await runServerConformance(harness)).map(r => [r.id, r]));
    }, timeoutMs);
    for (const check of planServerConformance(harness)) {
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
