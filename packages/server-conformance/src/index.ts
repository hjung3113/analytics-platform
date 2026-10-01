/**
 * Server boundary conformance kit (#145). Judges any `PlatformAdapter.menuQuery` implementation — the mock today,
 * the in-house server adapter later — against the menu query contract (docs/integration/real-server-checklist.md,
 * 06 §5·§19). Every check is derived from an endpoint declaration plus one request the granted actor can run, so
 * the kit knows no menu and no mock internals.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import {
  emptyGlobal, projectContext,
  type AnyEndpointSpec, type ApiResponse, type AssessmentKind, type GlobalContext, type MenuQuery, type Permission, type PlatformAdapter,
} from '@ap/contracts';

export type ConformanceCase = {
  spec: AnyEndpointSpec;
  /** Params the granted actor's request succeeds with (`ok` or `empty`). Must be a plain object. */
  params: Record<string, unknown>;
};

export type ServerConformanceHarness = {
  adapter: Pick<PlatformAdapter, 'menuQuery'>;
  cases: readonly ConformanceCase[];
  /** Applied Context values a granted request uses: a granted site and an absolute period inside every endpoint limit. */
  context: { scopeId: string; from: string; to: string };
  /** A site the granted actor holds no grant for. */
  foreignScopeId: string;
  /** Run `fn` as the granted actor: every case permission and the `context.scopeId` grant. */
  asGranted<T>(fn: () => Promise<T>): Promise<T>;
  /** Run `fn` as the granted actor minus `permission` — everything else equal. */
  withoutPermission<T>(permission: Permission, fn: () => Promise<T>): Promise<T>;
};

/** One check: `run` resolves to null when the adapter conforms, otherwise to the reason it does not. */
export type ConformanceCheck = {
  id: string;
  /** 'granted' checks run concurrently as the granted actor; 'permission' checks run one at a time without a permission. */
  mode: 'granted' | 'permission';
  run: () => Promise<string | null>;
};

export type ConformanceResult = { id: string; failure: string | null };

const SET_KEYS = ['roomNames', 'selection', 'lotIds', 'recipeIds'] as const;
/** Every GlobalContext key a request may carry, in projection order. */
const CONTEXT_KEYS = Object.keys(emptyGlobal) as (keyof GlobalContext)[];
const UNKNOWN_ENDPOINT = '__conformance.unknown';
const UNKNOWN_KEY = '__conformance_unknown';

function baseRequest(harness: ServerConformanceHarness, c: ConformanceCase): MenuQuery {
  const global: GlobalContext = { ...emptyGlobal, ...harness.context };
  return { endpoint: c.spec.id, context: projectContext(c.spec, global), params: c.params };
}

function describeResponse(r: ApiResponse<unknown>): string {
  return `${r.outcome}${r.message ? ` (${r.message})` : ''}`;
}

function sameKinds(actual: readonly { kind: AssessmentKind }[], declared: readonly AssessmentKind[]): boolean {
  const a = actual.map(x => x.kind).sort();
  const d = [...declared].sort();
  return a.length === d.length && a.every((kind, i) => kind === d[i]);
}

function expectOutcome(send: () => Promise<ApiResponse<unknown>>, outcome: ApiResponse<unknown>['outcome'], why: string) {
  return async () => {
    const r = await send();
    return r.outcome === outcome ? null : `${why}: expected ${outcome}, got ${describeResponse(r)}`;
  };
}

/** The checks one harness implies, derived synchronously from the declarations (stable test names). */
export function planServerConformance(harness: ServerConformanceHarness): ConformanceCheck[] {
  const send = (req: unknown) => () => harness.adapter.menuQuery(req as MenuQuery);
  const checks: ConformanceCheck[] = [{
    id: 'unknown endpoint → error',
    mode: 'granted',
    run: expectOutcome(send({ endpoint: UNKNOWN_ENDPOINT, context: {}, params: {} }), 'error', 'an unregistered endpoint id'),
  }];

  for (const c of harness.cases) {
    const { spec } = c;
    const base = baseRequest(harness, c);
    const applied = Object.keys(base.context) as (keyof GlobalContext)[];
    const name = (what: string) => `${spec.id} · ${what}`;

    checks.push({
      id: name('granted request succeeds with exactly the declared assessment kinds'),
      mode: 'granted',
      run: async () => {
        const r = await harness.adapter.menuQuery(base);
        if (r.outcome !== 'ok' && r.outcome !== 'empty') return `expected ok or empty, got ${describeResponse(r)}`;
        if (!sameKinds(r.assessments, spec.kinds)) {
          return `assessments [${r.assessments.map(a => a.kind).join(', ')}] ≠ declared [${spec.kinds.join(', ')}]`;
        }
        return null;
      },
    });
    checks.push({
      id: name('unknown top-level request key → error'),
      mode: 'granted',
      run: expectOutcome(send({ ...base, permission: spec.permission }), 'error', 'the client must not be able to send permission or any other extra key'),
    });
    checks.push({
      id: name('unknown params key → error'),
      mode: 'granted',
      run: expectOutcome(send({ ...base, params: { ...c.params, [UNKNOWN_KEY]: 1 } }), 'error', 'params outside paramKeys'),
    });

    // Every declared key is its own check: a server that validates only a sampled key must not pass (#146 review).
    for (const key of CONTEXT_KEYS.filter(k => !applied.includes(k))) {
      checks.push({
        id: name(`non-applied Context key ${key} → error`),
        mode: 'granted',
        run: expectOutcome(send({ ...base, context: { ...base.context, [key]: emptyGlobal[key] } }), 'error', 'a key the endpoint does not apply (Q3)'),
      });
    }
    for (const key of applied) {
      const context = { ...base.context };
      delete context[key];
      checks.push({
        id: name(`missing applied Context key ${key} → error`),
        mode: 'granted',
        run: expectOutcome(send({ ...base, context }), 'error', 'an applied key absent from the request (Q9)'),
      });
    }
    if (spec.context.time === 'apply') {
      checks.push({
        id: name('time applied with a null from → error'),
        mode: 'granted',
        run: expectOutcome(send({ ...base, context: { ...base.context, from: null } }), 'error', 'an applied period must be absolute'),
      });
    }
    if (spec.context.metric === 'apply') {
      checks.push({
        id: name('metricVersion without metricId → error'),
        mode: 'granted',
        run: expectOutcome(send({ ...base, context: { ...base.context, metricId: null, metricVersion: '1' } }), 'error', 'the metric pair travels together (06 §6.1)'),
      });
    }
    if (spec.requiresScope) {
      checks.push({
        id: name('a site without a grant → forbidden'),
        mode: 'granted',
        run: expectOutcome(send({ ...base, context: { ...base.context, scopeId: harness.foreignScopeId } }), 'forbidden', 'Scope is re-validated per request'),
      });
      checks.push({
        id: name('a null Scope → forbidden'),
        mode: 'granted',
        run: expectOutcome(send({ ...base, context: { ...base.context, scopeId: null } }), 'forbidden', 'a Scope-requiring endpoint has no site to read'),
      });
    }
    for (const emptySet of SET_KEYS.filter(key => applied.includes(key))) {
      checks.push({
        id: name(`explicit empty ${emptySet}: [] → empty with no assessments and no trust`),
        mode: 'granted',
        run: async () => {
          const r = await harness.adapter.menuQuery({ ...base, context: { ...base.context, [emptySet]: [] } });
          if (r.outcome !== 'empty') return `expected empty, got ${describeResponse(r)}`;
          if (r.assessments.length > 0 || r.trust !== null) return 'an explicit empty set is answered without reading a source (06 §19): no assessments, null trust';
          return null;
        },
      });
    }
    checks.push({
      id: name(`without ${spec.permission} → forbidden`),
      mode: 'permission',
      run: () => harness.withoutPermission(spec.permission, expectOutcome(send(base), 'forbidden', 'the endpoint permission is re-checked per request')),
    });
  }
  return checks;
}

/** Runs every planned check: granted checks concurrently as the granted actor, permission checks one at a time. */
export async function runServerConformance(harness: ServerConformanceHarness): Promise<ConformanceResult[]> {
  const checks = planServerConformance(harness);
  const failureOf = async (check: ConformanceCheck): Promise<ConformanceResult> => {
    try {
      return { id: check.id, failure: await check.run() };
    } catch (error) {
      return { id: check.id, failure: `the adapter threw instead of answering an envelope: ${String(error)}` };
    }
  };
  const granted = await harness.asGranted(() => Promise.all(checks.filter(c => c.mode === 'granted').map(failureOf)));
  const permission: ConformanceResult[] = [];
  for (const check of checks.filter(c => c.mode === 'permission')) permission.push(await failureOf(check));
  const byId = new Map([...granted, ...permission].map(r => [r.id, r]));
  return checks.map(c => byId.get(c.id)!);
}

/**
 * Registers the kit as a vitest suite: one test per check, named by endpoint and rule. The checks run once in
 * `beforeAll` (concurrently where the actor allows), then each test reports its own result.
 */
export function describeServerConformance(title: string, harness: ServerConformanceHarness, timeoutMs = 120_000): void {
  describe(title, () => {
    let results = new Map<string, string | null>();
    beforeAll(async () => {
      results = new Map((await runServerConformance(harness)).map(r => [r.id, r.failure]));
    }, timeoutMs);
    for (const check of planServerConformance(harness)) {
      it(check.id, () => {
        expect(results.has(check.id), `${check.id} did not run`).toBe(true);
        expect(results.get(check.id), check.id).toBeNull();
      });
    }
  });
}
