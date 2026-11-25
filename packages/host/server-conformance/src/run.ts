import { beforeAll, describe, expect, it } from 'vitest';
import type { ConformanceCheck, ConformanceResult, ServerConformanceHarness } from './types';
import { planServerConformance } from './plan/endpoints';

// Twice the core server's 30 s request budget (apps/platform-api/src/config.ts) and equal to the upload check's 60 s deadline.
const DEFAULT_CALL_TIMEOUT_MS = 60_000;

/** Reject stalled calls inside the check so its cleanup and actor wrappers can finish before the runner moves on. */
function withCallDeadlines(harness: ServerConformanceHarness): ServerConformanceHarness {
  const timeoutMs = harness.callTimeoutMs ?? DEFAULT_CALL_TIMEOUT_MS;
  const timedOut = new Set<PropertyKey>();
  function wrap<T extends object>(port: T): T {
    return new Proxy(port, {
      get(target, method) {
        const value = Reflect.get(target, method);
        if (typeof value !== 'function') return value;
        return (...args: unknown[]) => {
          const message = `${String(method)} did not answer within ${timeoutMs} ms`;
          if (timedOut.has(method)) return Promise.reject(new Error(`${message} earlier in this run`));
          const result = Reflect.apply(value, target, args);
          if (typeof result?.then !== 'function') return result;

          let timer: ReturnType<typeof setTimeout> | undefined;
          const deadline = new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              timedOut.add(method);
              reject(new Error(message));
            }, timeoutMs);
          });
          return Promise.race([result, deadline]).finally(() => clearTimeout(timer));
        };
      },
    });
  }

  const adapter = wrap(harness.adapter);
  const ports = new Proxy(harness.ports, {
    get(target, key) {
      if (key !== 'savedViews') return Reflect.get(target, key);
      const sample = target.savedViews;
      return sample && {
        get menuId() { return sample.menuId; },
        get user() { return wrap(sample.user); },
        get admin() { return wrap(sample.admin); },
      };
    },
  });
  return new Proxy(harness, {
    get(target, key) {
      if (key === 'adapter') return adapter;
      if (key === 'ports') return ports;
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

/** The check's own deadline bounds the whole check when it names one. */
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
  const checks = planServerConformance(withCallDeadlines(harness));
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
  const grantedChecks = checks.filter(c => c.mode === 'granted');
  const consoleChecks = checks.filter(c => c.mode === 'console');
  const granted = grantedChecks.length ? await harness.asGranted(() => Promise.all(grantedChecks.map(failureOf))) : [];
  const consoleResults = consoleChecks.length ? await harness.asConsole(() => Promise.all(consoleChecks.map(failureOf))) : [];
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
export function describeServerConformance(title: string, harness: ServerConformanceHarness, timeoutMs = 120_000): void {
  // Validated when the suite is registered, not only in `beforeAll`: a suite whose every check is planned skipped never
  // runs that hook, and an invalid declaration would pass unseen (#2894 review).
  const plan = planServerConformance(harness);
  knownLimitationsOf(harness, plan);
  describe(title, () => {
    let results = new Map<string, ConformanceResult>();
    beforeAll(async () => {
      results = new Map((await runServerConformance(harness)).map(r => [r.id, r]));
    }, timeoutMs);
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
