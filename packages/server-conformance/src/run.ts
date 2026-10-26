import { beforeAll, describe, expect, it } from 'vitest';
import type { ConformanceCheck, ConformanceResult, ServerConformanceHarness } from './types';
import { planServerConformance } from './plan/endpoints';

/** Runs every planned check: granted checks concurrently as the granted actor, then console checks concurrently as the console actor, then sequential checks one at a time (each switching actors itself), then permission checks one at a time. Skipped checks are not run — they stay visible in the returned list by id. */
export async function runServerConformance(harness: ServerConformanceHarness): Promise<ConformanceResult[]> {
  const checks = planServerConformance(harness);
  const failureOf = async (check: ConformanceCheck): Promise<ConformanceResult> => {
    try {
      const failure = await check.run();
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
    return result;
  });
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
        expect(result.failure, check.id).toBeNull();
      });
    }
  });
}
