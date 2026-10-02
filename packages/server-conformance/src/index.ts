/**
 * Server boundary conformance kit (#145, #152). Judges any `PlatformAdapter` implementation — the mock today,
 * the in-house server adapter later — against the menu query contract (docs/integration/real-server-checklist.md,
 * 06 §5·§19) and the port methods beyond menuQuery (checklist §2: session, subscribe, validateScope, getEntity,
 * entityAudit, the console reads). Every check is derived from a contract declaration plus samples the granted
 * actor can run, so the kit knows no menu and no mock internals.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import {
  emptyGlobal, projectContext,
  type AnyEndpointSpec, type ApiResponse, type Assessment, type AssessmentKind, type ClientErrorReport, type EntityRef,
  type GlobalContext, type MenuQuery, type Permission, type PlatformAdapter, type Trust, type UsageEvent,
} from '@ap/contracts';

export type ConformanceCase = {
  spec: AnyEndpointSpec;
  /** Params the granted actor's request succeeds with (`ok` or `empty`). Must be a plain object. */
  params: Record<string, unknown>;
  /**
   * Params whose result exceeds the spec's declared `limits.maxRows`. The check is derived when both the declaration
   * and this sample exist; it expects `too_large` with no data (#175). A declaration without this sample plans a
   * skipped check instead of silently dropping the rule.
   */
  oversizeParams?: Record<string, unknown>;
};

/**
 * Sample inputs for the port checks (#152): destinations and events the granted actor may use. Step 2 consumes
 * `annotation`·`usage`·`clientError`·`otherGrantedScopeId` (annotations, telemetry, error reporting); they shape
 * the harness now so that step needs no second breaking change.
 */
export type PortSamples = {
  /** A destination the granted actor may read: `ref.scopeId` is `context.scopeId`, its room is granted; `permission` is that type's view permission. */
  entity: { ref: EntityRef; permission: Permission };
  /** A chart the granted actor may annotate and the permission it needs (step 2). */
  annotation: { chartId: string; permission: Permission };
  /** A valid usage entry event the granted actor may record (step 2). */
  usage: UsageEvent;
  /** A valid client error report (step 2). */
  clientError: ClientErrorReport;
  /** A second site the granted actor holds a grant in (step 2: annotation isolation). */
  otherGrantedScopeId: string;
};

export type ServerConformanceHarness = {
  adapter: PlatformAdapter;
  cases: readonly ConformanceCase[];
  /** Applied Context values a granted request uses: a granted site and an absolute period inside every endpoint limit. */
  context: { scopeId: string; from: string; to: string };
  /** A site the granted actor holds no grant for. */
  foreignScopeId: string;
  /** Sample inputs for the port checks: a readable destination, a chart to annotate, telemetry shapes, a second granted site. */
  ports: PortSamples;
  /**
   * Run `fn` as the granted actor: every case permission plus `ports.entity.permission` and
   * `ports.annotation.permission`, holding grants at `context.scopeId` and `ports.otherGrantedScopeId`.
   * It need not hold `console:access`.
   */
  asGranted<T>(fn: () => Promise<T>): Promise<T>;
  /** Run `fn` as the granted actor minus `permission` — everything else equal. */
  withoutPermission<T>(permission: Permission, fn: () => Promise<T>): Promise<T>;
  /** Run `fn` as an actor holding `console:access` (the console reads); everything else equal. */
  asConsole<T>(fn: () => Promise<T>): Promise<T>;
};

/** One check: `run` resolves to null when the adapter conforms, otherwise to the reason it does not. */
export type ConformanceCheck = {
  id: string;
  /**
   * 'granted' checks run concurrently as the granted actor; 'console' checks run concurrently as the console
   * actor after the granted batch; 'permission' checks run one at a time without a permission; 'skipped'
   * checks never run (#175: a maxRows declaration with no oversize sample) — they surface in the plan and as
   * `it.skip` in the vitest suite so the gap stays visible.
   */
  mode: 'granted' | 'console' | 'permission' | 'skipped';
  /**
   * True for non-envelope methods (checklist §2: `session`, `subscribe`, `validateScope`): a throw is not
   * "refusing to answer an envelope" there, so the failure message says the method threw/rejected instead.
   */
  nonEnvelope?: boolean;
  run: () => Promise<string | null>;
};

/** `skipped`: planned but not run (e.g. no oversize sample) — never counted as a pass. `failure` is null unless `failed`. */
export type ConformanceResult = { id: string; status: 'passed' | 'failed' | 'skipped'; failure: string | null };

const SET_KEYS = ['roomNames', 'selection', 'lotIds', 'recipeIds'] as const;
/** Every GlobalContext key a request may carry, in projection order. */
const CONTEXT_KEYS = Object.keys(emptyGlobal) as (keyof GlobalContext)[];
const UNKNOWN_ENDPOINT = '__conformance.unknown';
const UNKNOWN_KEY = '__conformance_unknown';
const UNKNOWN_SITE = '__conformance_unknown_site';
/** Console reads are `console:access` (adapter.ts) — a contract constant, named so the kit never hardcodes it inline. */
const CONSOLE_ACCESS: Permission = 'console:access';
/** Outcomes that answer nothing — checklist §2 getEntity: a rejection never carries row fields. */
const REJECTIONS: readonly ApiResponse<unknown>['outcome'][] = ['forbidden', 'error', 'too_large', 'timeout'];

function baseRequest(harness: ServerConformanceHarness, c: ConformanceCase): MenuQuery {
  const global: GlobalContext = { ...emptyGlobal, ...harness.context };
  return { endpoint: c.spec.id, context: projectContext(c.spec, global), params: c.params };
}

function describeResponse(r: ApiResponse<unknown>): string {
  return `${r.outcome}${r.message ? ` (${r.message})` : ''}`;
}

/** 06 §19: each assessment must carry what its state claims — a source when it asserts, a reason when it cannot. */
function assessmentProblem(assessments: readonly Assessment[], outcome: ApiResponse<unknown>['outcome']): string | null {
  const seen = new Set<AssessmentKind>();
  for (const a of assessments) {
    if (seen.has(a.kind)) return `assessment kind ${a.kind} appears more than once (06 §19)`;
    seen.add(a.kind);
    if ((a.state === 'confirmed' || a.state === 'clear') && (!a.statusSource || !a.observedAt)) {
      return `${a.kind} is ${a.state} without statusSource/observedAt (06 §19)`;
    }
    if (a.state === 'unknown' && !a.reason) return `${a.kind} is unknown without a reason (06 §19)`;
    if (a.explainsEmpty === true && !(outcome === 'empty' && a.state === 'confirmed')) {
      return `${a.kind} sets explainsEmpty outside an empty outcome confirmed by a source (06 §19)`;
    }
  }
  return null;
}

/** 06 §18 + contracts `Trust`: trust is null (not mart data) or complete — unknown values are null, never dropped or retyped. */
function trustProblem(trust: Trust | null): string | null {
  if (trust === null) return null;
  if (typeof trust.updatedAt !== 'string') return 'trust.updatedAt is not a string (06 §18)';
  if (trust.dataThrough !== null && typeof trust.dataThrough !== 'string') return 'trust.dataThrough is not a string or null (06 §18)';
  if (trust.coverage !== null && typeof trust.coverage !== 'number') return 'trust.coverage is not a number or null (06 §18)';
  if (typeof trust.provisional !== 'boolean') return 'trust.provisional is not a boolean (06 §18)';
  if (typeof trust.source !== 'string') return 'trust.source is not a string (06 §18)';
  if (trust.metricVersion !== undefined && typeof trust.metricVersion !== 'string') return 'trust.metricVersion is neither absent nor a string (06 §18)';
  return null;
}

function sameKinds(actual: readonly { kind: AssessmentKind }[], declared: readonly AssessmentKind[]): boolean {
  const a = actual.map(x => x.kind).sort();
  const d = [...declared].sort();
  return a.length === d.length && a.every((kind, i) => kind === d[i]);
}

function expectOutcome(send: () => Promise<ApiResponse<unknown>>, outcome: ApiResponse<unknown>['outcome'], why: string) {
  return async () => {
    const r = await send();
    if (r.outcome !== outcome) return `${why}: expected ${outcome}, got ${describeResponse(r)}`;
    if (REJECTIONS.includes(r.outcome) && r.data !== null) {
      return `${why}: a ${r.outcome} answer carries no data (checklist §2: rejections never carry row fields)`;
    }
    return null;
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
      id: name('granted response assessments are well-formed (06 §19)'),
      mode: 'granted',
      run: async () => {
        const r = await harness.adapter.menuQuery(base);
        if (r.outcome !== 'ok' && r.outcome !== 'empty') return `expected ok or empty, got ${describeResponse(r)}`;
        return assessmentProblem(r.assessments, r.outcome);
      },
    });
    checks.push({
      id: name('granted response trust is null or complete (06 §18)'),
      mode: 'granted',
      run: async () => {
        const r = await harness.adapter.menuQuery(base);
        if (r.outcome !== 'ok' && r.outcome !== 'empty') return `expected ok or empty, got ${describeResponse(r)}`;
        return trustProblem(r.trust);
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
    if (spec.limits?.maxRows === undefined && c.oversizeParams) {
      // A sample for a cap the endpoint does not declare is a harness mistake (wrong endpoint, or a cap assumed but missing).
      checks.push({
        id: name('oversizeParams given but the endpoint declares no maxRows'),
        mode: 'granted',
        run: async () => 'the case carries an oversize sample, but the declaration has no limits.maxRows to judge it against',
      });
    }
    if (spec.limits?.maxRows !== undefined) {
      if (c.oversizeParams) {
        checks.push({
          id: name('oversize result over the declared maxRows → too_large with no data'),
          mode: 'granted',
          run: async () => {
            const r = await harness.adapter.menuQuery({ ...base, params: c.oversizeParams! });
            if (r.outcome !== 'too_large') {
              return `expected too_large over the declared maxRows ${spec.limits!.maxRows}, got ${describeResponse(r)}`;
            }
            if (r.data !== null) return 'a too_large answer carries no data';
            return null;
          },
        });
      } else {
        // Visible not-covered entry (#175 review P2-3): the declaration exists, so the gap must not vanish — the
        // vitest suite reports it as `it.skip` and the plan/run list it, instead of silently skipping the rule.
        checks.push({
          id: name('declares maxRows but has no oversizeParams sample — oversize check not run'),
          mode: 'skipped',
          run: async () => null, // never called: skipped checks are filtered out of every run
        });
      }
    }
    checks.push({
      id: name(`without ${spec.permission} → forbidden`),
      mode: 'permission',
      run: () => harness.withoutPermission(spec.permission, expectOutcome(send(base), 'forbidden', 'the endpoint permission is re-checked per request')),
    });
  }

  // Port checks beyond menuQuery (#152, checklist §2). Session/subscribe/validateScope are non-envelope methods:
  // they answer their own types, so a throw there is reported as the method throwing, not as a missing envelope.
  const { adapter, ports } = harness;
  const entityRef = ports.entity.ref;
  checks.push({
    id: 'port · session() returns the same object until the session changes',
    mode: 'granted',
    nonEnvelope: true,
    run: async () => (Object.is(adapter.session(), adapter.session())
      ? null
      : 'session() must return the same object while the session is unchanged — the kernel compares identity to decide re-validation'),
  });
  checks.push({
    id: 'port · session lists the granted sites and not the foreign one',
    mode: 'granted',
    nonEnvelope: true,
    run: async () => {
      const ids = adapter.session().scopes.map(s => s.id);
      if (!ids.includes(harness.context.scopeId) || !ids.includes(ports.otherGrantedScopeId)) {
        return `session().scopes must list the granted sites ${harness.context.scopeId} and ${ports.otherGrantedScopeId}, got [${ids.join(', ')}]`;
      }
      if (ids.includes(harness.foreignScopeId)) {
        return `session().scopes must not list the foreign site ${harness.foreignScopeId} — a site with no grant is not an option`;
      }
      return null;
    },
  });
  checks.push({
    id: 'port · subscribe returns an unsubscribe function',
    mode: 'granted',
    nonEnvelope: true,
    run: async () => {
      const unsubscribe = adapter.subscribe(() => {});
      if (typeof unsubscribe !== 'function') return 'subscribe must return an unsubscribe function';
      try {
        unsubscribe();
        unsubscribe();
      } catch (error) {
        return `unsubscribing (twice) threw: ${String(error)}`;
      }
      return null;
    },
  });
  checks.push({
    id: 'port · validateScope(granted site) → valid with its rooms',
    mode: 'granted',
    nonEnvelope: true,
    run: async () => {
      const check = await adapter.validateScope(harness.context.scopeId);
      if (check.status !== 'valid') return `expected valid for the granted site ${harness.context.scopeId}, got ${check.status}`;
      if (check.grantedRooms.length === 0) return 'a valid site must list its granted rooms';
      return null;
    },
  });
  checks.push({
    id: 'port · validateScope(foreign site) → forbidden with no rooms',
    mode: 'granted',
    nonEnvelope: true,
    run: async () => {
      const check = await adapter.validateScope(harness.foreignScopeId);
      if (check.status !== 'forbidden') return `expected forbidden for the foreign site ${harness.foreignScopeId}, got ${check.status}`;
      if (check.grantedRooms.length > 0) return `a forbidden site must not list rooms — got [${check.grantedRooms.join(', ')}] (room leak)`;
      return null;
    },
  });
  checks.push({
    id: 'port · validateScope(unknown site) → unknown_scope',
    mode: 'granted',
    nonEnvelope: true,
    run: async () => {
      const check = await adapter.validateScope(UNKNOWN_SITE);
      if (check.status !== 'unknown_scope') return `expected unknown_scope for ${UNKNOWN_SITE}, got ${check.status}`;
      if (check.grantedRooms.length > 0) return `an unknown site must not list rooms — got [${check.grantedRooms.join(', ')}]`;
      return null;
    },
  });
  checks.push({
    id: 'port · getEntity(sample) → ok with the row',
    mode: 'granted',
    run: async () => {
      const r = await adapter.getEntity(entityRef);
      if (r.outcome !== 'ok') return `expected ok, got ${describeResponse(r)}`;
      if (r.data === null) return 'the sample destination row is missing from the ok answer';
      return assessmentProblem(r.assessments, r.outcome) ?? trustProblem(r.trust);
    },
  });
  checks.push({
    id: 'port · getEntity of an unregistered type → error',
    mode: 'granted',
    run: expectOutcome(() => adapter.getEntity({ ...entityRef, type: UNKNOWN_ENDPOINT }), 'error', 'an unregistered entity type'),
  });
  checks.push({
    id: 'port · getEntity at a site without a grant → forbidden',
    mode: 'granted',
    run: expectOutcome(() => adapter.getEntity({ ...entityRef, scopeId: harness.foreignScopeId }), 'forbidden', 'a site the granted actor holds no grant for'),
  });
  checks.push({
    id: 'port · getEntity with a null Scope → forbidden',
    mode: 'granted',
    run: expectOutcome(() => adapter.getEntity({ ...entityRef, scopeId: null }), 'forbidden', 'a null Scope leaves no site to read'),
  });
  checks.push({
    id: `port · getEntity without ${ports.entity.permission} → forbidden`,
    mode: 'permission',
    run: () => harness.withoutPermission(
      ports.entity.permission,
      expectOutcome(() => adapter.getEntity(entityRef), 'forbidden', 'the destination view permission is re-checked per request'),
    ),
  });
  checks.push({
    id: 'port · entityAudit(sample) → events',
    mode: 'granted',
    run: async () => {
      const r = await adapter.entityAudit(entityRef);
      if (r.outcome !== 'ok' && r.outcome !== 'empty') return `expected ok or empty, got ${describeResponse(r)}`;
      if (r.outcome === 'ok' && !Array.isArray(r.data?.events)) return 'an ok entityAudit answer carries data.events as an array';
      return null;
    },
  });
  checks.push({
    id: 'port · entityAudit of an unregistered type → error',
    mode: 'granted',
    run: expectOutcome(() => adapter.entityAudit({ ...entityRef, type: UNKNOWN_ENDPOINT }), 'error', 'an unregistered entity type'),
  });
  checks.push({
    id: 'port · entityAudit at a site without a grant → forbidden',
    mode: 'granted',
    run: expectOutcome(() => adapter.entityAudit({ ...entityRef, scopeId: harness.foreignScopeId }), 'forbidden', 'a site the granted actor holds no grant for'),
  });
  checks.push({
    id: `port · entityAudit without ${ports.entity.permission} → forbidden`,
    mode: 'permission',
    run: () => harness.withoutPermission(
      ports.entity.permission,
      expectOutcome(() => adapter.entityAudit(entityRef), 'forbidden', 'the destination audit read uses that destination\'s view permission'),
    ),
  });
  // Console reads (checklist §2): console:access under the console actor, forbidden without it. auditTrail and
  // accessDirectory answer 'empty' on a zero (adapter.ts/mock: a zero is a meaningful audit/directory result);
  // usageSummary answers 'ok' with an empty list (adapter.ts: the console never reads raw events, a zero is menus: []).
  const consoleReads = [
    { method: 'auditTrail', allowEmpty: true, send: () => adapter.auditTrail({}) },
    { method: 'accessDirectory', allowEmpty: true, send: () => adapter.accessDirectory({}) },
    { method: 'usageSummary', allowEmpty: false, send: () => adapter.usageSummary({ preset: 'all' }) },
  ] as const;
  for (const read of consoleReads) {
    checks.push({
      id: `port · ${read.method} as a console actor → ok`,
      mode: 'console',
      run: async () => {
        const r = await read.send();
        if (r.outcome !== 'ok' && !(read.allowEmpty && r.outcome === 'empty')) {
          return `a console actor reading ${read.method}: expected ok${read.allowEmpty ? ' or empty' : ''}, got ${describeResponse(r)}`;
        }
        return null;
      },
    });
    checks.push({
      id: `port · ${read.method} without console:access → forbidden`,
      mode: 'permission',
      run: () => harness.withoutPermission(
        CONSOLE_ACCESS,
        expectOutcome(read.send, 'forbidden', `the console read ${read.method} requires console:access`),
      ),
    });
  }
  checks.push({
    id: 'port · accessDirectory is not mart data: no assessments, null trust',
    mode: 'console',
    run: async () => {
      const r = await adapter.accessDirectory({});
      // A read that did not succeed is the `→ ok` check's failure; this check owns only the mart-data rule.
      if (r.outcome !== 'ok' && r.outcome !== 'empty') return null;
      if (r.assessments.length > 0 || r.trust !== null) {
        return 'accessDirectory is not mart data (adapter.ts): no assessments, null trust';
      }
      return null;
    },
  });
  return checks;
}

/** Runs every planned check: granted checks concurrently as the granted actor, then console checks concurrently as the console actor, then permission checks one at a time. Skipped checks are not run — they stay visible in the returned list by id. */
export async function runServerConformance(harness: ServerConformanceHarness): Promise<ConformanceResult[]> {
  const checks = planServerConformance(harness);
  const failureOf = async (check: ConformanceCheck): Promise<ConformanceResult> => {
    try {
      const failure = await check.run();
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
  const permission: ConformanceResult[] = [];
  for (const check of checks.filter(c => c.mode === 'permission')) permission.push(await failureOf(check));
  const byId = new Map([...granted, ...consoleResults, ...permission].map(r => [r.id, r]));
  return checks.map(c => {
    if (c.mode === 'skipped') return { id: c.id, status: 'skipped', failure: null };
    const result = byId.get(c.id);
    if (!result) throw new Error(`conformance check planned but not run: ${c.id}`);
    return result;
  });
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
      if (check.mode === 'skipped') {
        it.skip(check.id, () => {});
        continue;
      }
      it(check.id, () => {
        expect(results.has(check.id), `${check.id} did not run`).toBe(true);
        expect(results.get(check.id), check.id).toBeNull();
      });
    }
  });
}
