import { beforeAll, describe, expect, it } from 'vitest';
import type { PlatformAdapter } from '@ap/contracts';
import type { ConformanceCheck, ConformanceResult, PortMethod, ServerConformanceHarness } from './types';
import { planServerConformance } from './plan/endpoints';
import { SAVED_VIEW_PORT_METHODS } from './plan/ports/saved-views';
import { ConformanceCallTimeout } from './call-timeout';

// Twice the core server's 30 s request budget (apps/platform-api/src/config.ts) and equal to the upload check's 60 s deadline.
const DEFAULT_CALL_TIMEOUT_MS = 60_000;

// The real-server adapter resolves methods from the active actor and need not enumerate them.
type OptionalPortMethod = 'listEquipmentFacts' | 'uploadFile';
const ADAPTER_METHODS = {
  session: true, validateScope: true, listAxisOptions: true, searchEquipment: true, resolveSelection: true,
  publishedMetrics: true, contextOptions: true, evaluateSelection: true, getEntity: true, menuQuery: true,
  menuAction: true, defaultRangeTo: true, recordUsage: true, reportClientError: true, usageSummary: true,
  usageNextScreens: true, auditTrail: true, entityAudit: true, accessDirectory: true, listAnnotations: true,
  saveAnnotation: true, deleteAnnotation: true, readPreferences: true, patchPreferences: true, importPreferences: true,
  lookupPeople: true, listNotices: true, saveNotice: true, deleteNotice: true, subscribe: true,
} satisfies Record<Exclude<PortMethod, OptionalPortMethod>, true>;
const OPTIONAL_ADAPTER_METHODS: readonly OptionalPortMethod[] = ['listEquipmentFacts', 'uploadFile'];

type EndCheck = () => void;

/** Runs the granted and console batches in order, then the sequential and permission checks one at a time. */
export async function runServerConformance(harness: ServerConformanceHarness): Promise<ConformanceResult[]> {
  const timeoutMs = harness.callTimeoutMs ?? DEFAULT_CALL_TIMEOUT_MS;
  let firstStall: ConformanceCallTimeout | undefined;

  function forwardMethod<T extends object>(original: T, method: keyof T, pending?: Set<EndCheck>) {
    return (...args: unknown[]) => {
      const result = (original[method] as (...args: unknown[]) => unknown)(...args);
      if (typeof (result as PromiseLike<unknown> | undefined)?.then !== 'function') return result;

      let endCheck: EndCheck | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const error = new ConformanceCallTimeout(`${String(method)} did not answer within ${timeoutMs} ms`);
          firstStall ??= error;
          reject(error);
        }, timeoutMs);
        if (pending) {
          endCheck = () => {
            clearTimeout(timer);
            reject(new Error('the check ended'));
          };
          pending.add(endCheck);
        }
      });
      return Promise.race([result, deadline]).finally(() => {
        clearTimeout(timer);
        if (endCheck) pending?.delete(endCheck);
      });
    };
  }

  function forwardAdapter(pending?: Set<EndCheck>): PlatformAdapter {
    const original = harness.adapter;
    const adapter = Object.fromEntries(
      (Object.keys(ADAPTER_METHODS) as PortMethod[]).map(method => [method, forwardMethod(original, method, pending)]),
    ) as PlatformAdapter;
    for (const method of OPTIONAL_ADAPTER_METHODS) {
      Object.defineProperty(adapter, method, {
        get: () => typeof original[method] === 'function' ? forwardMethod(original, method, pending) : undefined,
      });
    }
    return adapter;
  }

  const forwardingHarness: ServerConformanceHarness = {
    adapter: forwardAdapter(),
    get implemented() { return harness.implemented; },
    get siteGrants() { return harness.siteGrants; },
    get cases() { return harness.cases; },
    get context() { return harness.context; },
    get foreignScopeId() { return harness.foreignScopeId; },
    get actions() { return harness.actions; },
    get withdrawGrant() { return harness.withdrawGrant?.bind(harness); },
    asGranted: fn => harness.asGranted(fn),
    asConsole: fn => harness.asConsole(fn),
    withoutPermission: (permission, fn) => harness.withoutPermission(permission, fn),
    asOtherAnnotator: fn => harness.asOtherAnnotator(fn),
    get ports() {
      const original = harness.ports;
      return {
        get options() { return original.options; },
        get condition() { return original.condition; },
        get entity() { return original.entity; },
        get annotation() { return original.annotation; },
        get usage() { return original.usage; },
        get clientError() { return original.clientError; },
        get otherGrantedScopeId() { return original.otherGrantedScopeId; },
        get visiblePersonId() { return original.visiblePersonId; },
        get savedViews() {
          const sample = original.savedViews;
          if (!sample) return undefined;
          const forwardStore = (store: typeof sample.user) => Object.fromEntries(
            SAVED_VIEW_PORT_METHODS.map(method => [method, forwardMethod(store, method)]),
          ) as typeof store;
          return {
            get menuId() { return sample.menuId; },
            get user() { return forwardStore(sample.user); },
            get admin() { return forwardStore(sample.admin); },
          };
        },
      };
    },
  };
  const checks = planServerConformance(forwardingHarness);
  const limitations = knownLimitationsOf(harness, checks);

  async function runCheck(check: ConformanceCheck): ReturnType<ConformanceCheck['run']> {
    const { timeoutMs } = check;
    if (timeoutMs === undefined) return check.run();
    const pending = new Set<EndCheck>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<string>(resolve => {
      timer = setTimeout(() => resolve(`did not finish within its own deadline of ${timeoutMs} ms`), timeoutMs);
    });
    try {
      return await Promise.race([check.run(forwardAdapter(pending)), deadline]);
    } finally {
      clearTimeout(timer);
      for (const endCheck of pending) endCheck();
    }
  }

  const failureOf = async (check: ConformanceCheck): Promise<ConformanceResult> => {
    try {
      const failure = await runCheck(check);
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
  // After a stall an abandoned call may still complete, so shared fixture and actor state can no longer be trusted.
  // Let the current batch settle, then stop before another batch or serial check can spend another call deadline.
  const consoleResults = !firstStall && consoleChecks.length ? await harness.asConsole(() => Promise.all(consoleChecks.map(failureOf))) : [];
  const serial: ConformanceResult[] = [];
  const serialChecks = [...checks.filter(c => c.mode === 'sequential'), ...checks.filter(c => c.mode === 'permission')];
  for (const check of serialChecks) {
    if (firstStall) break;
    serial.push(await failureOf(check));
  }

  const byId = new Map([...granted, ...consoleResults, ...serial].map(r => [r.id, r]));
  return checks.map(c => {
    if (c.mode === 'skipped') return { id: c.id, status: 'skipped', failure: null };
    const result = byId.get(c.id);
    if (result) return withKnownLimitation(result, limitations.get(c.baseId ?? c.id));
    if (firstStall) return { id: c.id, status: 'failed', failure: `not run: ${firstStall.message} earlier in this run` };
    throw new Error(`conformance check planned but not run: ${c.id}`);
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
