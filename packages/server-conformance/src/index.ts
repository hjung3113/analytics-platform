import { planSelectionPortChecks, type OptionPortSamples } from './selection-ports';
export type { OptionPortSamples } from './selection-ports';
/**
 * Server boundary conformance kit (#145, #152). Judges any `PlatformAdapter` implementation — the mock today,
 * the in-house server adapter later — against the menu query contract (docs/integration/real-server-checklist.md,
 * 06 §5·§19) and the port methods beyond menuQuery (checklist §2: session, subscribe, validateScope, getEntity,
 * entityAudit, the console reads, annotations, usage telemetry, client error reports). Every check is derived
 * from a contract declaration plus samples the granted actor can run, so the kit knows no menu and no mock internals.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import {
  CONTEXT_FIELDS, emptyGlobal, missingRequiredContext, parseDateTime, parseQuery, projectContext, type Condition,
  type ActionResponse, type AnnotationInput, type AnyActionSpec, type AnyEndpointSpec, type ApiResponse, type Assessment, type AssessmentKind, type ClientErrorReport, type EntityRef,
  type GlobalContext, type MenuAction, type MenuQuery, type Permission, type PlatformAdapter, type Trust, type UsageEvent, type UsageSummary,
} from '@ap/contracts';

export type ConformanceCase = {
  spec: AnyEndpointSpec;
  /** Params the granted actor's request succeeds with (`ok` or `empty`). Must be a plain object. */
  params: Record<string, unknown>;
  /** Valid applied Context sample values, merged with the harness Scope/period before projection. */
  context?: Partial<GlobalContext>;
  /**
   * Params whose result exceeds the spec's declared `limits.maxRows`. The check is derived when both the declaration
   * and this sample exist; it expects `too_large` with no data (#175). A declaration without this sample plans a
   * skipped check instead of silently dropping the rule.
   */
  oversizeParams?: Record<string, unknown>;
};

/**
 * One declared write (ADR-0054, checklist §3–§4) and an `input` the granted actor's request succeeds with. The kit mints
 * its own idempotency keys. A `concurrency: 'version'` action also needs `currentVersion`: the target's current
 * version, read before each fresh successful write.
 */
export type ActionCase = {
  spec: AnyActionSpec;
  input: Record<string, unknown>;
  currentVersion?: () => Promise<string>;
};

/**
 * Sample inputs for the port checks (#152): destinations, charts and events the granted actor may use — a
 * readable destination, an annotable chart, a valid usage entry, a valid client error report, and a second
 * site the actor also holds a grant in.
 */
export type PortSamples = {
  options?: OptionPortSamples;
  /** A declared endpoint plus app-owned axis values that demonstrate narrowing. */
  condition?: { endpoint: string; axisA: { id: string; values: readonly [string, string] }; axisB: { id: string; value: string }; nonHistoryAxisId: string };
  /**
   * A destination the granted actor may read: a site-scoped type at `ref.scopeId: context.scopeId` whose room is
   * granted (a siteless type like 지표 cannot pass the site/Scope checks — checklist §4); `permission` is that
   * type's view permission. `ungrantedRoomRef` (optional, 06 §22 room re-check): a real destination at
   * `context.scopeId` in a room the granted account does NOT hold. Present → the getEntity/entityAudit room
   * re-checks run; absent → they plan visible skipped checks instead of silently dropping the rule (#175 pattern).
   */
  entity: { ref: EntityRef; permission: Permission; ungrantedRoomRef?: EntityRef };
  /** A chart the granted actor may annotate, the permission it needs, and a valid range on that chart's axis — naive wall-clock on a time axis, category labels on a category axis (06 §16). */
  annotation: { chartId: string; from: string; to: string; permission: Permission };
  /**
   * Identity fields (menuId·spaceId·path·sessionId) of a usage event the granted account may record; `name`, `at` and dwell fields are ignored — the kit builds its own entry/dwell.
   * The global-menu check clones this sample with `spaceId: null` (null is always valid on this port, so a missing separate global sample does not skip it).
   */
  usage: UsageEvent;
  /** A valid client error report. The global-menu check clones it with `spaceId: null` rather than skipping. */
  clientError: ClientErrorReport;
  /** A second site the granted actor holds a grant in (annotation isolation). */
  otherGrantedScopeId: string;
};

export type ServerConformanceHarness = {
  adapter: PlatformAdapter;
  cases: readonly ConformanceCase[];
  /** Applied Context values a granted request uses: a granted site and an absolute period inside every endpoint limit. */
  context: { scopeId: string; from: string; to: string };
  /** A site the granted actor holds no grant for — one the server knows: an unknown id answers `unknown_scope`, not `forbidden`, and fails the foreign-site check (checklist §4). */
  foreignScopeId: string;
  ports: PortSamples;
  /** Declared writes to derive the menuAction checks from. Absent or empty plans one visible skipped check (`actions: no sample`). */
  actions?: readonly ActionCase[];
  /**
   * Run `fn` as the granted actor: every case permission plus `ports.entity.permission`,
   * `ports.annotation.permission` and every action permission, holding grants at `context.scopeId` and `ports.otherGrantedScopeId`.
   * It need not hold `console:access`.
   */
  asGranted<T>(fn: () => Promise<T>): Promise<T>;
  /**
   * Run `fn` as the granted actor minus `permission`. Called with every case permission plus
   * `ports.entity.permission`, `ports.annotation.permission`, every action permission and `console:access` — a permission the
   * granted account does not hold (e.g. `console:access`) means the granted account itself, so a team
   * provisioning one account per removed permission needs exactly that set (checklist §4).
   */
  withoutPermission<T>(permission: Permission, fn: () => Promise<T>): Promise<T>;
  /** Run `fn` as an actor holding `console:access` (the console reads) — a different account from the granted one in practice. */
  asConsole<T>(fn: () => Promise<T>): Promise<T>;
  /**
   * Run `fn` as a second user, distinct from the granted one, who can annotate: `ports.annotation.permission` and a
   * grant at `context.scopeId`. The author-only delete check uses it as "another user" — a refusal only proves
   * authorship when this account is allowed to annotate, so the kit first proves it can (#399).
   */
  asOtherAnnotator<T>(fn: () => Promise<T>): Promise<T>;
};

/** One check: `run` resolves to null when the adapter conforms, otherwise to the reason it does not. */
export type ConformanceCheck = {
  id: string;
  /**
   * 'granted' checks run concurrently as the granted actor; 'console' checks run concurrently as the console
   * actor after the granted batch; 'sequential' checks run one at a time after the console batch and before
   * the permission checks — their `run` switches actors itself (never inside a concurrent batch: the mock's
   * role is global, so a mid-batch switch would race the other checks); 'permission' checks run one at a
   * time without a permission; 'skipped' checks never run (#175: a maxRows declaration with no oversize
   * sample) — they surface in the plan and as `it.skip` in the vitest suite so the gap stays visible.
   */
  mode: 'granted' | 'console' | 'sequential' | 'permission' | 'skipped';
  /**
   * True for checks whose method does not answer an envelope: the non-envelope methods (checklist §2:
   * `session`, `subscribe`, `validateScope`) and the fire-and-forget `recordUsage`/`reportClientError` (they
   * may reject) — a throw there is not "refusing to answer an envelope", so the failure message says the
   * method threw/rejected instead.
   */
  nonEnvelope?: boolean;
  run: () => Promise<string | null>;
};

/** `skipped`: planned but not run (e.g. no oversize sample) — never counted as a pass. `failure` is null unless `failed`. */
export type ConformanceResult = { id: string; status: 'passed' | 'failed' | 'skipped'; failure: string | null };

const SET_KEYS = ['lineNames', 'prcGroups', 'roomNames', 'selection', 'lotIds', 'recipeIds'] as const;
/** Every GlobalContext key a request may carry, in projection order. */
const CONTEXT_KEYS = Object.keys(emptyGlobal) as (keyof GlobalContext)[];
const UNKNOWN_ENDPOINT = '__conformance.unknown';
const UNKNOWN_ENTITY_TYPE = '__conformance.unknown_type';
const UNKNOWN_KEY = '__conformance_unknown';
const UNKNOWN_SITE = '__conformance_unknown_site';
/** Console reads are `console:access` (adapter.ts) — a contract constant, named so the kit never hardcodes it inline. */
const CONSOLE_ACCESS: Permission = 'console:access';
/** adapter.ts `ChartAnnotation`: the only row fields a client ever sees — the server stamps the author, never sent, never returned; `mine` is the computed hint (#399). */
const ANNOTATION_ROW_KEYS = ['id', 'chartId', 'scopeId', 'from', 'to', 'text', 'at', 'mine'] as const;
/** Outcomes that answer nothing — checklist §2 getEntity: a rejection never carries row fields. */
const REJECTIONS: readonly ApiResponse<unknown>['outcome'][] = ['forbidden', 'error', 'too_large', 'timeout'];

function baseRequest(harness: ServerConformanceHarness, c: ConformanceCase): MenuQuery {
  const global: GlobalContext = { ...emptyGlobal, ...harness.context, ...c.context };
  return { endpoint: c.spec.id, context: projectContext(c.spec, global), params: c.params };
}

function describeResponse(r: ApiResponse<unknown>): string {
  return `${r.outcome}${r.message ? ` (${r.message})` : ''}`;
}

/**
 * A key omitted is not null: before the shape checks run, an `assessments` that is not an array or a `trust`
 * that is `undefined` fails naming the missing key — instead of the shape checks throwing on undefined and
 * the runner misreporting "the adapter threw instead of answering an envelope". Each check guards only the
 * key it reads, so one missing key fails its own checks and no others.
 */
function missingEnvelopeKey(r: ApiResponse<unknown>, key: 'assessments' | 'trust'): string | null {
  if (key === 'assessments' && !Array.isArray(r.assessments)) return '`assessments` is missing';
  if (key === 'trust' && r.trust === undefined) return '`trust` is missing — send null for non-mart data (06 §18)';
  return null;
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
    const caseStart = checks.length;
    const { spec } = c;
    const base = baseRequest(harness, c);
    const applied = Object.keys(base.context) as (keyof GlobalContext)[];
    const name = (what: string) => `${spec.id} · ${what}`;

    const noSample = missingRequiredContext(spec.requiredContext ?? [], base.context).length > 0;
    checks.push({
      id: name('granted request succeeds with exactly the declared assessment kinds'),
      mode: 'granted',
      run: async () => {
        const r = await harness.adapter.menuQuery(base);
        if (r.outcome !== 'ok' && r.outcome !== 'empty') return `expected ok or empty, got ${describeResponse(r)}`;
        const missing = missingEnvelopeKey(r, 'assessments');
        if (missing) return missing;
        if (SET_KEYS.some(key => Array.isArray(base.context[key]) && base.context[key]!.length === 0)) {
          const missingTrust = missingEnvelopeKey(r, 'trust');
          if (missingTrust) return missingTrust;
          if (r.outcome !== 'empty' || r.assessments.length > 0 || r.trust !== null) return 'an explicit empty set is answered without reading a source (06 §19): empty, no assessments, null trust';
          return null;
        }
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
        const missing = missingEnvelopeKey(r, 'assessments');
        if (missing) return missing;
        return assessmentProblem(r.assessments, r.outcome);
      },
    });
    checks.push({
      id: name('granted response trust is null or complete (06 §18)'),
      mode: 'granted',
      run: async () => {
        const r = await harness.adapter.menuQuery(base);
        if (r.outcome !== 'ok' && r.outcome !== 'empty') return `expected ok or empty, got ${describeResponse(r)}`;
        const missing = missingEnvelopeKey(r, 'trust');
        if (missing) return missing;
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
    for (const key of spec.requiredContext ?? []) {
      for (const mutation of ['null', 'omitted'] as const) {
        const context = { ...base.context };
        for (const field of CONTEXT_FIELDS[key]) {
          if (mutation === 'omitted') delete context[field];
          else context[field] = null;
        }
        checks.push({ id: name(`required ${key} ${mutation} → error`), mode: 'granted',
          run: expectOutcome(send({ ...base, context }), 'error', 'a required Context item must be present') });
      }
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
          const missing = missingEnvelopeKey(r, 'assessments') ?? missingEnvelopeKey(r, 'trust');
          if (missing) return missing;
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
    if (noSample) {
      for (const check of checks.slice(caseStart)) {
        check.mode = 'skipped';
        check.id += ' — required Context: no valid sample';
      }
    }
  }

  return [...checks, ...planPortChecks(harness), ...planActionChecks(harness), ...planConditionChecks(harness), ...planSelectionPortChecks(harness)];
}

const describeAction = (r: ActionResponse<unknown>): string => `${r.outcome}${r.message ? ` (${r.message})` : ''}`;

/**
 * The menuAction checks (ADR-0054, checklist §3–§4), derived per `harness.actions` sample. All run `sequential`: the
 * kit mints its own keys, and every granted request and `currentVersion()` read runs inside `asGranted` (sequential
 * mode selects no actor). Only the permission-before-replay check leaves the granted wrapper before the same
 * saved request goes through `withoutPermission`.
 */
function planActionChecks(harness: ServerConformanceHarness): ConformanceCheck[] {
  const { adapter } = harness;
  if (!harness.actions?.length) {
    return [{ id: 'actions: no sample', mode: 'skipped', run: async () => null }];
  }
  const checks: ConformanceCheck[] = [];
  for (const c of harness.actions) {
    const { spec } = c;
    const versioned = spec.concurrency === 'version';
    const name = (what: string) => `${spec.id} · ${what}`;
    if (versioned && !c.currentVersion) {
      checks.push({ id: name('declares version concurrency but has no currentVersion sample — action checks not run'), mode: 'skipped', run: async () => null });
      continue;
    }
    // `key: null` omits the key; `version` overrides the freshly read expectedVersion.
    const prepare = (over: { key?: string | null; input?: Record<string, unknown>; scopeId?: string; version?: string } = {}): Promise<MenuAction> =>
      harness.asGranted(async () => {
        const req: MenuAction = {
          action: spec.id,
          context: spec.requiresScope ? { scopeId: over.scopeId ?? harness.context.scopeId } : {},
          input: over.input ?? c.input,
          idempotencyKey: over.key ?? crypto.randomUUID(),
          ...(versioned ? { expectedVersion: over.version ?? await c.currentVersion!() } : {}),
        };
        if (over.key === null) delete (req as Partial<MenuAction>).idempotencyKey;
        return req;
      });
    const sendGranted = (req: MenuAction) => harness.asGranted(() => adapter.menuAction(req));
    const want = (r: ActionResponse<unknown>, outcome: ActionResponse<unknown>['outcome'], why: string): string | null =>
      (r.outcome === outcome ? null : `${why}: expected ${outcome}, got ${describeAction(r)}`);
    const unexpectedInput = { ...c.input, __conformance_unexpected: true };

    checks.push({
      id: name('ok, then the same key and input → the stored answer with replayed: true'),
      mode: 'sequential',
      run: async () => {
        const req = await prepare();
        const first = await sendGranted(req);
        const bad = want(first, 'ok', 'a granted write');
        if (bad) return bad;
        if (first.replayed !== false) return 'a fresh answer must carry replayed: false';
        // The same request object: a version action keeps its original expectedVersion on replay.
        const again = await sendGranted(req);
        return want(again, 'ok', 'the replay')
          ?? (again.replayed !== true ? 'the replay must carry replayed: true'
            : JSON.stringify(again.data) !== JSON.stringify(first.data) ? 'the replay must return the stored data'
            : null);
      },
    });
    checks.push({
      id: name('the same key with a different input → error'),
      mode: 'sequential',
      run: async () => {
        const req = await prepare();
        const first = await sendGranted(req);
        const bad = want(first, 'ok', 'a granted write');
        // Replay is judged before input values (checklist §3), so an extra key is a different input a server must refuse as reuse, not as `invalid`.
        return bad ?? want(await sendGranted({ ...req, input: unexpectedInput }), 'error', 'the key reused with another input');
      },
    });
    for (const [what, key] of [['omitted', null], ['empty', ''], ['not a UUID', 'not-a-uuid']] as const) {
      checks.push({
        id: name(`idempotencyKey ${what} → invalid at idempotencyKey`),
        mode: 'sequential',
        run: async () => {
          const r = await sendGranted(await prepare({ key }));
          const bad = want(r, 'invalid', `a ${what} key`);
          if (bad) return bad;
          return r.fieldErrors?.some(e => e.path.length === 1 && e.path[0] === 'idempotencyKey')
            ? null : 'fieldErrors must name path ["idempotencyKey"]';
        },
      });
    }
    checks.push({
      id: name('an input key outside inputKeys → invalid with unexpected_field'),
      mode: 'sequential',
      run: async () => {
        const r = await sendGranted(await prepare({ input: unexpectedInput }));
        const bad = want(r, 'invalid', 'an undeclared input key');
        if (bad) return bad;
        return r.fieldErrors?.some(e => e.code === 'unexpected_field' && e.path[0] === '__conformance_unexpected')
          ? null : 'fieldErrors must carry code unexpected_field at the undeclared key';
      },
    });
    if (versioned) {
      checks.push({
        id: name('a stale expectedVersion → conflict with the current version'),
        mode: 'sequential',
        run: async () => {
          const stale = `${await harness.asGranted(c.currentVersion!)}~conformance-stale`;
          const r = await sendGranted(await prepare({ version: stale }));
          return want(r, 'conflict', 'a version that is not current') ?? (typeof r.version === 'string' ? null : 'a conflict must carry the current version');
        },
      });
    }
    checks.push({
      id: name(`permission precedes replay: without ${spec.permission} the same key → forbidden`),
      mode: 'sequential',
      run: async () => {
        const req = await prepare();
        const bad = want(await sendGranted(req), 'ok', 'a granted write');
        return bad ?? harness.withoutPermission(spec.permission, async () => want(await adapter.menuAction(req), 'forbidden', 'the stored answer must not reach an actor without the permission'));
      },
    });
    if (spec.requiresScope) {
      checks.push({
        id: name('a site without a grant → forbidden'),
        mode: 'sequential',
        run: async () => want(await sendGranted(await prepare({ scopeId: harness.foreignScopeId })), 'forbidden', 'a foreign scope'),
      });
    }
    checks.push({
      id: name('an invalid answer is not recorded: the same key then succeeds'),
      mode: 'sequential',
      run: async () => {
        const key = crypto.randomUUID();
        const bad = want(await sendGranted(await prepare({ key, input: unexpectedInput })), 'invalid', 'an undeclared input key');
        if (bad) return bad;
        const r = await sendGranted(await prepare({ key }));
        return want(r, 'ok', 'the same key with a valid input') ?? (r.replayed ? 'a fresh write after an invalid answer must not be a replay' : null);
      },
    });
  }
  return checks;
}

/** Axis vocabulary and data come entirely from the harness. */
function planConditionChecks(harness: ServerConformanceHarness): ConformanceCheck[] {
  const sample = harness.ports.condition;
  if (!sample) return [{ id: 'condition: no sample', mode: 'skipped', run: async () => null }];
  const { axisA, axisB } = sample;
  const evaluate = async (condition: Condition) => {
    const r = await harness.adapter.evaluateSelection({ ...emptyGlobal, scopeId: harness.context.scopeId, condition });
    return new Set(r.inCondition.map(e => e.equipmentId));
  };
  const single: Condition = { [axisA.id]: [axisA.values[0]] };
  const malformed: { label: string; patch: Record<string, unknown> }[] = [
    { label: 'malformed map', patch: { condition: [] } },
    { label: 'empty axis array', patch: { condition: { [axisA.id]: [] } } },
    { label: 'scalar axis', patch: { condition: { [axisA.id]: axisA.values[0] } } },
    { label: 'blank axis ID', patch: { condition: { [axisA.id]: [' '] } } },
    { label: 'scalar Line', patch: { lineNames: 'L10' } },
    { label: 'scalar PRC', patch: { prcGroups: 'P10' } },
    { label: 'invalid basis', patch: { membershipBasis: 'current' } },
    { label: 'orphan basis', patch: { membershipBasis: 'asOf' } },
  ];
  const endpointCase = harness.cases.find(c => c.spec.id === sample.endpoint);
  const invalidChecks: ConformanceCheck[] = malformed.flatMap(({ label, patch }) => {
    const checks: ConformanceCheck[] = [{
      id: `condition · evaluateSelection rejects ${label}`, mode: 'granted', nonEnvelope: true,
      run: async () => {
        try {
          await harness.adapter.evaluateSelection({ ...emptyGlobal, scopeId: harness.context.scopeId, ...patch } as Parameters<PlatformAdapter['evaluateSelection']>[0]);
          return 'invalid Selection input must reject';
        } catch (error) {
          return error instanceof Error && error.name !== 'TypeError' ? null : 'invalid input must be rejected explicitly, not crash during matching';
        }
      },
    }];
    if (endpointCase) {
      const base = baseRequest(harness, endpointCase);
      if (Object.keys(patch).every(key => key in base.context)) checks.push({
        id: `condition · menuQuery rejects ${label}`, mode: 'granted',
        run: expectOutcome(() => harness.adapter.menuQuery({ ...base, context: { ...base.context, ...patch } }), 'error', label),
      });
    }
    return checks;
  });

  return [
    ...invalidChecks,
    { id: 'condition · AND narrows across axes', mode: 'granted', nonEnvelope: true, run: async () => {
      const [base, both] = await Promise.all([evaluate(single), evaluate({ ...single, [axisB.id]: [axisB.value] })]);
      return both.size > 0 && both.size < base.size && [...both].every(id => base.has(id)) ? null : 'AND must produce a non-empty strict subset for the supplied sample';
    } },
    { id: 'condition · OR includes each value', mode: 'granted', nonEnvelope: true, run: async () => {
      const [a, b, either] = await Promise.all([evaluate(single), evaluate({ [axisA.id]: [axisA.values[1]] }), evaluate({ [axisA.id]: axisA.values })]);
      const union = new Set([...a, ...b]);
      return a.size > 0 && b.size > 0 && either.size === union.size && [...union].every(id => either.has(id)) ? null : 'OR must equal the union of the two non-empty samples';
    } },
    { id: 'condition · v1 single axis is equivalent', mode: 'granted', nonEnvelope: true, run: async () => {
      const legacy = parseQuery('?equipmentGroup=' + encodeURIComponent(JSON.stringify({ axis: axisA.id, id: axisA.values[0] }))).global.condition!;
      const [a, b] = await Promise.all([evaluate(single), evaluate(legacy)]);
      return a.size === b.size && [...a].every(id => b.has(id)) ? null : 'v1 decoding changed the matching equipment';
    } },
    { id: 'condition · asOf without history → error', mode: 'granted', run: async () => {
      const c = harness.cases.find(c => c.spec.id === sample.endpoint);
      if (!c || c.spec.context.condition !== 'apply') return 'condition sample needs a condition-applying endpoint';
      const base = baseRequest(harness, c);
      return expectOutcome(() => harness.adapter.menuQuery({ ...base, context: { ...base.context, condition: { [sample.nonHistoryAxisId]: [axisA.values[0]] }, membershipBasis: 'asOf' } }), 'error', 'asOf on a non-history axis')();
    } },
  ];
}

/**
 * The port checks beyond menuQuery (#152, checklist §2). Session/subscribe/validateScope are non-envelope
 * methods — they answer their own types, so a throw there is reported as the method throwing, not as a
 * missing envelope.
 */
function planPortChecks(harness: ServerConformanceHarness): ConformanceCheck[] {
  const { adapter, ports } = harness;
  const entityRef = ports.entity.ref;
  const ungrantedRoomRef = ports.entity.ungrantedRoomRef;
  const checks: ConformanceCheck[] = [];
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
      // Called once, never twice: adapter.ts requires `subscribe` to return a cleanup function — it does not
      // require the cleanup to be idempotent, so a one-shot unsubscribe is conforming (#152 round D).
      try {
        unsubscribe();
      } catch (error) {
        return `unsubscribing threw: ${String(error)}`;
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
    id: 'port · validateScope(second granted site) → valid',
    mode: 'granted',
    nonEnvelope: true,
    run: async () => {
      const check = await adapter.validateScope(ports.otherGrantedScopeId);
      if (check.status !== 'valid') return `expected valid for the second granted site ${ports.otherGrantedScopeId}, got ${check.status}`;
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
  // The remaining ports (#152 round D): sync snapshots and the condition-editor reads — non-envelope
  // methods, so each check judges the returned shape, never a 06 §19 envelope.
  checks.push({
    id: 'port · publishedMetrics() returns well-formed pointers',
    mode: 'granted',
    nonEnvelope: true,
    run: async () => {
      const pointers = adapter.publishedMetrics();
      if (!Array.isArray(pointers)) return `publishedMetrics() answers an array, got ${typeof pointers}`;
      for (const p of pointers) {
        if (typeof p.metricId !== 'string' || p.metricId.length === 0) {
          return 'every pointer carries a non-empty string metricId (adapter.ts PublishedMetric)';
        }
        if (typeof p.publishedVersion !== 'string' && p.publishedVersion !== null) {
          return `${p.metricId}: publishedVersion is a string or null — null = known, unpublished (adapter.ts PublishedMetric)`;
        }
      }
      return null;
    },
  });
  checks.push({
    id: 'port · defaultRangeTo() is a naive wall-clock',
    mode: 'granted',
    nonEnvelope: true,
    run: async () => {
      const anchor = adapter.defaultRangeTo();
      if (typeof anchor !== 'string') return `defaultRangeTo() answers a string, got ${typeof anchor}`;
      try {
        parseDateTime(anchor, 'defaultRangeTo'); // url.ts DATETIME — the URL contract's validator
      } catch (error) {
        return `defaultRangeTo() is the URL contract's naive wall-clock YYYY-MM-DDTHH:mm:ss with no zone/offset (06 §6.3): ${String(error)}`;
      }
      return null;
    },
  });
  checks.push({
    id: 'port · contextOptions(granted site) returns the option lists',
    mode: 'granted',
    nonEnvelope: true,
    run: async () => {
      const options = await adapter.contextOptions(harness.context.scopeId);
      for (const axis of ['stgroup', 'team'] as const) {
        if (!Array.isArray(options[axis]) || options[axis].some(v => typeof v !== 'string')) {
          return `contextOptions(${harness.context.scopeId}).${axis} is a string array (adapter.ts ConditionOptions)`;
        }
      }
      if (!Array.isArray(options.makerModel) || options.makerModel.some(mm => typeof mm.maker !== 'string' || typeof mm.model !== 'string')) {
        return `contextOptions(${harness.context.scopeId}).makerModel is an array of { maker, model } strings (adapter.ts ConditionOptions)`;
      }
      return null;
    },
  });
  // IdSet "no constraint" is null, never [] (url.ts: [] is an explicit empty set) — the kit asks for the
  // whole granted set and checks the server's own grant filter, not a client-sent room list.
  checks.push({
    id: 'port · evaluateSelection lists only equipment in granted rooms',
    mode: 'granted',
    nonEnvelope: true,
    run: async () => {
      const scope = await adapter.validateScope(harness.context.scopeId);
      if (scope.status !== 'valid') return `the granted site ${harness.context.scopeId} does not validate here (its own check reports the status)`;
      // Zero listed rooms is validateScope's own check's failure — the grant filter comparison only judges a
      // server that does list its rooms.
      const grantedRooms = scope.grantedRooms.length > 0 ? scope.grantedRooms : null;
      const evaluation = await adapter.evaluateSelection({ scopeId: harness.context.scopeId, roomNames: null, condition: null, lineNames: null, prcGroups: null, membershipBasis: null, selection: null });
      if (!Array.isArray(evaluation.inCondition) || !Array.isArray(evaluation.outOfCondition)) {
        return 'evaluateSelection answers inCondition and outOfCondition arrays (adapter.ts SelectionEvaluation)';
      }
      for (const e of evaluation.inCondition) {
        if (typeof e.equipmentId !== 'string' || typeof e.room !== 'string' || typeof e.model !== 'string') {
          return 'every inCondition item is { equipmentId, room, model } strings (adapter.ts EquipmentOption)';
        }
        if (grantedRooms !== null && !grantedRooms.includes(e.room)) {
          return `${e.equipmentId} sits in ${e.room}, outside the granted rooms [${grantedRooms.join(', ')}] — the server filters by the session's grants (adapter.ts)`;
        }
      }
      if (evaluation.outOfCondition.some(id => typeof id !== 'string')) {
        return 'outOfCondition is a string array (adapter.ts SelectionEvaluation)';
      }
      return null;
    },
  });
  checks.push({
    id: 'port · evaluateSelection at a site without a grant lists no equipment',
    mode: 'granted',
    nonEnvelope: true,
    run: async () => {
      // adapter.ts fixes no failure form for non-envelope async methods: an empty list or a rejection both
      // pass — only equipment actually listed at the ungranted site fails this check.
      let evaluation;
      try {
        evaluation = await adapter.evaluateSelection({ scopeId: harness.foreignScopeId, roomNames: null, condition: null, lineNames: null, prcGroups: null, membershipBasis: null, selection: null });
      } catch {
        return null;
      }
      if (!Array.isArray(evaluation.inCondition)) return 'evaluateSelection answers an inCondition array (adapter.ts SelectionEvaluation)';
      if (evaluation.inCondition.length > 0) {
        return `equipment is listed at the ungranted site ${harness.foreignScopeId} — grants filter the answer (adapter.ts)`;
      }
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
      return missingEnvelopeKey(r, 'assessments') ?? missingEnvelopeKey(r, 'trust') ?? assessmentProblem(r.assessments, r.outcome) ?? trustProblem(r.trust);
    },
  });
  checks.push({
    id: 'port · getEntity of an unregistered type → error',
    mode: 'granted',
    run: expectOutcome(() => adapter.getEntity({ ...entityRef, type: UNKNOWN_ENTITY_TYPE }), 'error', 'an unregistered entity type'),
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
  // 06 §22 (checklist §2 getEntity): site 검증 뒤 그 객체의 room을 다시 검증 — the sample sits at a granted
  // site in a room the granted account does NOT hold. No sample → a visible skipped check, never a silent drop.
  checks.push({
    id: 'port · getEntity of a destination in an ungranted room → forbidden',
    mode: ungrantedRoomRef ? 'granted' : 'skipped',
    run: ungrantedRoomRef
      ? expectOutcome(() => adapter.getEntity(ungrantedRoomRef), 'forbidden', 'the site is granted but this destination\'s room is not (06 §22 room re-check)')
      : async () => null, // never called: skipped checks are filtered out of every run
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
      if (r.outcome === 'ok' && r.data?.events.length === 0) return 'a zero is outcome empty, not ok with no events (adapter.ts)';
      // Every successful envelope answers the full 06 §19/§18 shape (#152 round D), like getEntity above.
      const missing = missingEnvelopeKey(r, 'assessments') ?? missingEnvelopeKey(r, 'trust');
      if (missing) return missing;
      return assessmentProblem(r.assessments, r.outcome) ?? trustProblem(r.trust);
    },
  });
  checks.push({
    id: 'port · entityAudit of an unregistered type → error',
    mode: 'granted',
    run: expectOutcome(() => adapter.entityAudit({ ...entityRef, type: UNKNOWN_ENTITY_TYPE }), 'error', 'an unregistered entity type'),
  });
  checks.push({
    id: 'port · entityAudit at a site without a grant → forbidden',
    mode: 'granted',
    run: expectOutcome(() => adapter.entityAudit({ ...entityRef, scopeId: harness.foreignScopeId }), 'forbidden', 'a site the granted actor holds no grant for'),
  });
  checks.push({
    id: 'port · entityAudit with a null Scope → forbidden',
    mode: 'granted',
    run: expectOutcome(() => adapter.entityAudit({ ...entityRef, scopeId: null }), 'forbidden', 'a site-scoped destination type with a null Scope leaves no site to read (adapter.ts: same gates as getEntity)'),
  });
  // Same room re-check on the audit read (adapter.ts: same gates as getEntity).
  checks.push({
    id: 'port · entityAudit of a destination in an ungranted room → forbidden',
    mode: ungrantedRoomRef ? 'granted' : 'skipped',
    run: ungrantedRoomRef
      ? expectOutcome(() => adapter.entityAudit(ungrantedRoomRef), 'forbidden', 'the site is granted but this destination\'s room is not (06 §22 room re-check)')
      : async () => null, // never called: skipped checks are filtered out of every run
  });
  checks.push({
    id: `port · entityAudit without ${ports.entity.permission} → forbidden`,
    mode: 'permission',
    run: () => harness.withoutPermission(
      ports.entity.permission,
      expectOutcome(() => adapter.entityAudit(entityRef), 'forbidden', 'the destination audit read uses that destination\'s view permission'),
    ),
  });
  // Console reads (checklist §2): console:access under the console actor, forbidden without it. The zero
  // outcomes are contract text (adapter.ts, checklist §2): usageSummary — nothing matched is a successful
  // zero, `ok` with `menus: []`, never `empty` (the console left-joins zero-visit menus; `empty` would hide
  // them); auditTrail and accessDirectory — a query that matches nothing is `empty`. This check reads page 1
  // (`auditTrail({})` / `accessDirectory({})`), where an `ok` with no rows or `total: 0` is the zero case.
  const consoleReads = [
    { method: 'auditTrail', allowEmpty: true, send: (): Promise<ApiResponse<{ items: readonly unknown[]; total: number }>> => adapter.auditTrail({}) },
    { method: 'accessDirectory', allowEmpty: true, send: (): Promise<ApiResponse<{ items: readonly unknown[]; total: number }>> => adapter.accessDirectory({}) },
    { method: 'usageSummary', allowEmpty: false, send: () => adapter.usageSummary({ preset: 'all' }) },
  ] as const;
  for (const read of consoleReads) {
    checks.push({
      id: `port · ${read.method} as a console actor → ok`,
      mode: 'console',
      run: async () => {
        if (!read.allowEmpty) {
          const r = await read.send();
          if (r.outcome !== 'ok') {
            return `a console actor reading ${read.method}: expected ok, got ${describeResponse(r)} — a zero is ok with menus: [], never empty (adapter.ts)`;
          }
          const missing = missingEnvelopeKey(r, 'assessments') ?? missingEnvelopeKey(r, 'trust');
          if (missing) return missing;
          return assessmentProblem(r.assessments, r.outcome) ?? trustProblem(r.trust);
        }
        const r = await read.send();
        if (r.outcome === 'empty') return null; // adapter.ts: a zero is a confirmed result.
        if (r.outcome !== 'ok') {
          return `a console actor reading ${read.method}: expected ok or empty, got ${describeResponse(r)}`;
        }
        if (r.data === null || r.data.items.length === 0 || r.data.total === 0) {
          return `an ok ${read.method} page 1 with no rows or total: 0 is the zero case — outcome empty, not ok (adapter.ts)`;
        }
        // Every successful `ok` answers the full 06 §19/§18 envelope shape (#152 round D).
        const missing = missingEnvelopeKey(r, 'assessments') ?? missingEnvelopeKey(r, 'trust');
        if (missing) return missing;
        return assessmentProblem(r.assessments, r.outcome) ?? trustProblem(r.trust);
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
      const missing = missingEnvelopeKey(r, 'assessments') ?? missingEnvelopeKey(r, 'trust');
      if (missing) return missing;
      if (r.assessments.length > 0 || r.trust !== null) {
        return 'accessDirectory is not mart data (adapter.ts): no assessments, null trust';
      }
      return null;
    },
  });
  // Annotations (06 §16, issue #103): server-owned rows keyed by (chartId, scopeId) — never chartId alone
  // (ADR-0004). The chart's permission and the site's grant are both server-checked; the server stamps the
  // author and `at`, so the client never sends or sees either.
  const { chartId, from: noteFrom, to: noteTo, permission: annotationPermission } = ports.annotation;
  // Every save carries a unique text marker, so a rejected or isolated note can be told apart from earlier ones.
  // `from`/`to` come from the harness: a range valid for that chart's axis (06 §16) — wall-clock on a time axis,
  // category labels on a category axis — so a server that validates the range against the axis can accept it.
  const annotationInput = (scopeId: string | null): AnnotationInput => ({
    chartId, scopeId, from: noteFrom, to: noteTo, text: `conformance ${crypto.randomUUID()}`,
  });
  checks.push({
    id: 'port · saveAnnotation then listAnnotations at the same site returns the note',
    mode: 'granted',
    run: async () => {
      const input = annotationInput(harness.context.scopeId);
      const saved = await adapter.saveAnnotation(input);
      if (saved.outcome !== 'ok') return `expected ok, got ${describeResponse(saved)}`;
      const row = saved.data;
      if (row === null) return 'the ok answer carries no saved row';
      if (typeof row.id !== 'string' || typeof row.at !== 'string') {
        return 'the saved row must carry the server-stamped string id and at';
      }
      if (row.chartId !== input.chartId || row.scopeId !== input.scopeId || row.from !== input.from || row.to !== input.to) {
        return 'the saved row must echo the input chartId·scopeId·from·to';
      }
      if (row.text !== input.text) return 'the saved row must echo the input text';
      if (row.mine !== true) return 'the saved row must carry mine: true for the user who just saved it (adapter.ts, #399)';
      const extra = Object.keys(row).filter(k => !(ANNOTATION_ROW_KEYS as readonly string[]).includes(k));
      if (extra.length > 0) {
        return `the saved row carries ${extra.join(', ')} — the server stamps the author and the client never sees or sends it (adapter.ts)`;
      }
      // Both successes answer the full 06 §19/§18 envelope shape (#152 round D), like getEntity above.
      const savedMissing = missingEnvelopeKey(saved, 'assessments') ?? missingEnvelopeKey(saved, 'trust');
      if (savedMissing) return `saveAnnotation: ${savedMissing}`;
      const savedProblem = assessmentProblem(saved.assessments, saved.outcome) ?? trustProblem(saved.trust);
      if (savedProblem) return `saveAnnotation: ${savedProblem}`;
      const list = await adapter.listAnnotations({ chartId, scopeId: input.scopeId });
      if (list.outcome !== 'ok') return `listing the site that just accepted the save: expected ok, got ${describeResponse(list)}`;
      const listMissing = missingEnvelopeKey(list, 'assessments') ?? missingEnvelopeKey(list, 'trust');
      if (listMissing) return `listAnnotations: ${listMissing}`;
      const listProblem = assessmentProblem(list.assessments, list.outcome) ?? trustProblem(list.trust);
      if (listProblem) return `listAnnotations: ${listProblem}`;
      if (!Array.isArray(list.data?.items) || !list.data!.items.some(item => item.id === row.id)) {
        return 'the note just saved is missing from its own site\'s list';
      }
      return null;
    },
  });
  checks.push({
    id: 'port · a note saved at one site is not listed at another',
    mode: 'granted',
    run: async () => {
      const saved = await adapter.saveAnnotation(annotationInput(harness.context.scopeId));
      if (saved.outcome !== 'ok' || saved.data === null) return `expected ok with the saved row, got ${describeResponse(saved)}`;
      const list = await adapter.listAnnotations({ chartId, scopeId: ports.otherGrantedScopeId });
      if (list.outcome !== 'ok' && list.outcome !== 'empty') return `expected ok or empty, got ${describeResponse(list)}`;
      if (list.data?.items.some(item => item.id === saved.data!.id)) {
        return `a note written at ${harness.context.scopeId} is listed at ${ports.otherGrantedScopeId} — annotations are keyed by (chartId, scopeId), never chartId alone (06 §16, ADR-0004)`;
      }
      return null;
    },
  });
  checks.push({
    id: 'port · listAnnotations at a site without a grant → forbidden',
    mode: 'granted',
    run: expectOutcome(() => adapter.listAnnotations({ chartId, scopeId: harness.foreignScopeId }), 'forbidden', 'a site the granted actor holds no grant for'),
  });
  checks.push({
    id: 'port · saveAnnotation at a site without a grant → forbidden',
    mode: 'granted',
    run: expectOutcome(() => adapter.saveAnnotation(annotationInput(harness.foreignScopeId)), 'forbidden', 'a site the granted actor holds no grant for'),
  });
  checks.push({
    id: 'port · listAnnotations with a null Scope → forbidden',
    mode: 'granted',
    run: expectOutcome(() => adapter.listAnnotations({ chartId, scopeId: null }), 'forbidden', 'a null scope is not a request the server answers, never "all sites"'),
  });
  checks.push({
    id: 'port · saveAnnotation with a null Scope → forbidden',
    mode: 'granted',
    run: expectOutcome(() => adapter.saveAnnotation(annotationInput(null)), 'forbidden', 'a null scope is not a request the server answers, never "all sites"'),
  });
  checks.push({
    id: 'port · saveAnnotation carrying an at → error, nothing stored',
    mode: 'granted',
    run: async () => {
      const input = annotationInput(harness.context.scopeId);
      const saved = await adapter.saveAnnotation({ ...input, at: '2026-01-01T00:00' } as AnnotationInput);
      if (saved.outcome !== 'error') return `a client-stamped at is an unknown key: expected error, got ${describeResponse(saved)}`;
      const list = await adapter.listAnnotations({ chartId, scopeId: input.scopeId });
      if (list.outcome === 'ok' && list.data?.items.some(item => item.text === input.text)) {
        return 'the rejected note was stored anyway';
      }
      return null;
    },
  });
  // adapter.ts saveAnnotation: a user/at/id in the input is an unknown key — one check, both calls.
  checks.push({
    id: 'port · saveAnnotation carrying an id or a user → error',
    mode: 'granted',
    run: async () => {
      const input = annotationInput(harness.context.scopeId);
      for (const extra of [{ id: 'ann-x' }, { user: 'someone' }] as const) {
        const saved = await adapter.saveAnnotation({ ...input, ...extra } as AnnotationInput);
        if (saved.outcome !== 'error') {
          return `a client-sent ${Object.keys(extra)[0]} is an unknown key: expected error, got ${describeResponse(saved)}`;
        }
      }
      return null;
    },
  });
  checks.push({
    id: 'port · annotations are not mart data: no assessments, null trust',
    mode: 'granted',
    run: async () => {
      const saved = await adapter.saveAnnotation(annotationInput(harness.context.scopeId));
      // Calls that did not succeed are the save/list checks' failures; this check owns only the mart-data rule.
      if (saved.outcome !== 'ok') return null;
      const saveMissing = missingEnvelopeKey(saved, 'assessments') ?? missingEnvelopeKey(saved, 'trust');
      if (saveMissing) return `saveAnnotation: ${saveMissing}`;
      if (saved.assessments.length > 0 || saved.trust !== null) {
        return 'saveAnnotation is not mart data (adapter.ts): no assessments, null trust';
      }
      const list = await adapter.listAnnotations({ chartId, scopeId: harness.context.scopeId });
      if (list.outcome !== 'ok' && list.outcome !== 'empty') return null;
      const listMissing = missingEnvelopeKey(list, 'assessments') ?? missingEnvelopeKey(list, 'trust');
      if (listMissing) return `listAnnotations: ${listMissing}`;
      if (list.assessments.length > 0 || list.trust !== null) {
        return 'listAnnotations is not mart data (adapter.ts): no assessments, null trust';
      }
      return null;
    },
  });
  checks.push({
    id: `port · listAnnotations without ${annotationPermission} → forbidden`,
    mode: 'permission',
    run: () => harness.withoutPermission(
      annotationPermission,
      expectOutcome(() => adapter.listAnnotations({ chartId, scopeId: harness.context.scopeId }), 'forbidden', 'the annotation read re-checks the chart permission per request'),
    ),
  });
  checks.push({
    id: `port · saveAnnotation without ${annotationPermission} → forbidden`,
    mode: 'permission',
    run: () => harness.withoutPermission(
      annotationPermission,
      expectOutcome(() => adapter.saveAnnotation(annotationInput(harness.context.scopeId)), 'forbidden', 'the annotation write re-checks the chart permission per request'),
    ),
  });
  // Author-only delete (#399, ADR-0041). The two actors are the granted account and a second annotating account (`asOtherAnnotator`), so
  // these run sequentially and switch actors themselves (the mock's role is global).
  const deleteRef = (id: string, scopeId: string | null = harness.context.scopeId) => ({ chartId, scopeId, id });
  const saveAsGranted = async (): Promise<{ id: string } | string> => {
    const saved = await harness.asGranted(() => adapter.saveAnnotation(annotationInput(harness.context.scopeId)));
    return saved.outcome === 'ok' && saved.data ? { id: saved.data.id } : `saving the note to delete: expected ok, got ${describeResponse(saved)}`;
  };
  // A server that does not keep a saved note already fails the save-then-list check; the delete cases do not repeat that failure.
  const savedAndListed = async (): Promise<{ id: string } | string | null> => {
    const saved = await saveAsGranted();
    if (typeof saved === 'string') return saved;
    const ids = await listIds(harness.asGranted);
    if (typeof ids === 'string') return ids;
    return ids.includes(saved.id) ? saved : null;
  };
  const listIds = async (actor: <T>(fn: () => Promise<T>) => Promise<T>): Promise<string[] | string> => {
    const list = await actor(() => adapter.listAnnotations({ chartId, scopeId: harness.context.scopeId }));
    if (list.outcome === 'empty') return [];
    return list.outcome === 'ok' && list.data ? list.data.items.map(i => i.id) : `listing: expected ok or empty, got ${describeResponse(list)}`;
  };
  checks.push({
    id: 'port · deleteAnnotation by the author removes the note',
    mode: 'sequential',
    run: async () => {
      const saved = await savedAndListed();
      if (saved === null) return null;
      if (typeof saved === 'string') return saved;
      const deleted = await harness.asGranted(() => adapter.deleteAnnotation(deleteRef(saved.id)));
      if (deleted.outcome !== 'ok') return `the author deleting their own note: expected ok, got ${describeResponse(deleted)}`;
      if (deleted.data?.id !== saved.id) return 'the ok answer must carry the deleted id';
      const missing = missingEnvelopeKey(deleted, 'assessments') ?? missingEnvelopeKey(deleted, 'trust');
      if (missing) return `deleteAnnotation: ${missing}`;
      const problem = assessmentProblem(deleted.assessments, deleted.outcome) ?? trustProblem(deleted.trust);
      if (problem) return `deleteAnnotation: ${problem}`;
      const ids = await listIds(harness.asGranted);
      if (typeof ids === 'string') return ids;
      return ids.includes(saved.id) ? 'the deleted note is still listed' : null;
    },
  });
  checks.push({
    id: 'port · deleteAnnotation by another user → forbidden and the note stays',
    mode: 'sequential',
    run: async () => {
      const saved = await savedAndListed();
      if (saved === null) return null;
      if (typeof saved === 'string') return saved;
      // The second actor must be able to annotate, or a refusal could be the permission/site gate rather than authorship.
      const own = await harness.asOtherAnnotator(() => adapter.saveAnnotation(annotationInput(harness.context.scopeId)));
      if (own.outcome !== 'ok' || !own.data) {
        await harness.asGranted(() => adapter.deleteAnnotation(deleteRef(saved.id)));
        return `the second actor cannot annotate (saving its own note: expected ok, got ${describeResponse(own)}) — asOtherAnnotator needs ${annotationPermission} and a grant at ${harness.context.scopeId}, so a refusal would not prove authorship`;
      }
      const other = await harness.asOtherAnnotator(() => adapter.deleteAnnotation(deleteRef(saved.id)));
      const ids = await listIds(harness.asGranted);
      await harness.asGranted(() => adapter.deleteAnnotation(deleteRef(saved.id)));
      const ownDeleted = await harness.asOtherAnnotator(() => adapter.deleteAnnotation(deleteRef(own.data!.id)));
      if (ownDeleted.outcome !== 'ok') return `the second actor deleting its own note: expected ok, got ${describeResponse(ownDeleted)}`;
      if (other.outcome !== 'forbidden') return `a user who is not the author: expected forbidden, got ${describeResponse(other)}`;
      if (typeof ids === 'string') return ids;
      return ids.includes(saved.id) ? null : 'the note was removed by a user who is not its author';
    },
  });
  checks.push({
    id: 'port · deleteAnnotation of an id not at this site → empty',
    mode: 'granted',
    run: expectOutcome(() => adapter.deleteAnnotation(deleteRef(`ann-missing-${crypto.randomUUID().slice(0, 8)}`)), 'empty', 'an id that is not in this chart·site answers empty, never revealing a row elsewhere'),
  });
  checks.push({
    id: 'port · deleteAnnotation at a site without a grant → forbidden',
    mode: 'granted',
    run: expectOutcome(() => adapter.deleteAnnotation(deleteRef('ann-1', harness.foreignScopeId)), 'forbidden', 'a site the granted actor holds no grant for'),
  });
  checks.push({
    id: 'port · deleteAnnotation with a null Scope → forbidden',
    mode: 'granted',
    run: expectOutcome(() => adapter.deleteAnnotation(deleteRef('ann-1', null)), 'forbidden', 'a null scope is not a request the server answers, never "all sites"'),
  });
  checks.push({
    id: `port · deleteAnnotation without ${annotationPermission} → forbidden`,
    mode: 'permission',
    run: () => harness.withoutPermission(
      annotationPermission,
      expectOutcome(() => adapter.deleteAnnotation(deleteRef('ann-1')), 'forbidden', 'the annotation delete re-checks the chart permission per request'),
    ),
  });
  // Usage telemetry (checklist §2 fire-and-forget, §5): the server stamps the session user and the receive
  // time; the client `at`/`enteredAt` are shape-checked and stored, and one bad event rejects the whole call.
  // ports.usage may arrive dwell-shaped: derive the entry from its identity fields (drop dwellMs/enteredAt) so
  // a dwell sample cannot turn the valid-entry event invalid.
  const usageEntry: UsageEvent = {
    name: 'entry', menuId: ports.usage.menuId, spaceId: ports.usage.spaceId, path: ports.usage.path,
    sessionId: ports.usage.sessionId, at: Date.now(),
  };
  const usageDwell: UsageEvent = { ...usageEntry, name: 'dwell', enteredAt: usageEntry.at, dwellMs: 1200 };
  const badUsageEvent = (patch: Record<string, unknown>): UsageEvent => ({ ...usageEntry, ...patch }) as unknown as UsageEvent;
  const expectAccepted = (events: readonly UsageEvent[], accepted: number, why: string) => async () => {
    const r = await adapter.recordUsage(events);
    return r.accepted === accepted ? null : `${why}: expected accepted ${accepted}, got ${r.accepted}`;
  };
  checks.push({
    id: 'port · recordUsage accepts a valid entry and dwell',
    mode: 'granted',
    nonEnvelope: true,
    run: expectAccepted([usageEntry, usageDwell], 2, 'a valid entry and dwell'),
  });
  // Global utility menus send spaceId null (06 §9.1). Null is always valid on this port, so the check clones
  // the harness sample instead of skipping when no separate global sample was given. 'feedback' is a removed
  // space id; any other string outside the declared SpaceId union is unknown.
  // Board provenance (ADR-0049): `source` is optional (absent = legacy main), `board` carries an opaque stayId.
  const boardEntry: UsageEvent = { ...usageEntry, source: 'board', stayId: 'conformance-stay-1' };
  const boardDwell: UsageEvent = { ...usageDwell, source: 'board', stayId: 'conformance-stay-1' };
  checks.push({
    id: 'port · recordUsage accepts a board entry and dwell (source, stayId)',
    mode: 'granted',
    nonEnvelope: true,
    run: expectAccepted([boardEntry, boardDwell], 2, 'a valid board entry and dwell with source and stayId'),
  });
  checks.push({
    id: 'port · recordUsage accepts an explicit main source and a legacy event without one',
    mode: 'granted',
    nonEnvelope: true,
    run: expectAccepted([{ ...usageEntry, source: 'main' }, usageEntry], 2, 'an explicit main source next to a legacy event without source'),
  });
  checks.push({
    id: 'port · recordUsage: an unknown source is rejected',
    mode: 'granted',
    nonEnvelope: true,
    run: expectAccepted([badUsageEvent({ source: 'sidebar' })], 0, 'a source other than main/board — the whole call rejects'),
  });
  // Navigation path (#605): `via` and `fromMenuId` on a main-screen entry only; `via` is a closed set.
  checks.push({
    id: 'port · recordUsage accepts via and fromMenuId on a main entry',
    mode: 'granted',
    nonEnvelope: true,
    run: expectAccepted([{ ...usageEntry, via: 'sidebar', fromMenuId: ports.usage.menuId }, { ...usageEntry, source: 'main', via: 'direct', fromMenuId: null }], 2, 'a main entry with via and fromMenuId (a menu id or null)'),
  });
  checks.push({
    id: 'port · recordUsage: a via outside the closed set is rejected',
    mode: 'granted',
    nonEnvelope: true,
    run: expectAccepted([badUsageEvent({ via: 'bookmark' })], 0, 'a via outside the closed set — the whole call rejects'),
  });
  checks.push({
    id: 'port · recordUsage: a stayId without board source is rejected',
    mode: 'granted',
    nonEnvelope: true,
    run: expectAccepted([badUsageEvent({ stayId: 'conformance-stay-1' })], 0, 'a stayId on a non-board event — the whole call rejects'),
  });
  checks.push({
    id: 'port · recordUsage: an unknown key next to source is rejected',
    mode: 'granted',
    nonEnvelope: true,
    run: expectAccepted([{ ...boardEntry, paneId: 'p1' } as unknown as UsageEvent], 0, 'an unknown key on a board event — the whole call rejects'),
  });
  checks.push({
    id: 'port · recordUsage accepts a global menu (spaceId null)',
    mode: 'granted',
    nonEnvelope: true,
    run: expectAccepted([{ ...usageEntry, spaceId: null }], 1, 'a global menu (spaceId null)'),
  });
  checks.push({
    id: 'port · recordUsage: spaceId feedback is rejected',
    mode: 'granted',
    nonEnvelope: true,
    run: expectAccepted([badUsageEvent({ spaceId: 'feedback' })], 0, 'the removed feedback space id'),
  });
  checks.push({
    id: 'port · recordUsage: an unknown spaceId is rejected',
    mode: 'granted',
    nonEnvelope: true,
    run: expectAccepted([badUsageEvent({ spaceId: 'nope' })], 0, 'an unknown space id'),
  });
  checks.push({
    id: 'port · recordUsage: one bad event rejects the whole call',
    mode: 'granted',
    nonEnvelope: true,
    run: expectAccepted([usageEntry, badUsageEvent({ url: '/equipment?scopeId=MEM' })], 0, 'one bad event among a valid one — the whole call rejects (checklist §5)'),
  });
  checks.push({
    id: 'port · recordUsage: a client userId is rejected',
    mode: 'granted',
    nonEnvelope: true,
    run: expectAccepted([badUsageEvent({ userId: 'someone-else' })], 0, 'a client-sent userId — the server stamps the session user'),
  });
  checks.push({
    id: 'port · recordUsage: a concrete path with a query is rejected',
    mode: 'granted',
    nonEnvelope: true,
    run: expectAccepted([badUsageEvent({ path: `${usageEntry.path}?scopeId=MEM` })], 0, 'a concrete pathname with a query — only the manifest route pattern travels'),
  });
  checks.push({
    id: 'port · recordUsage: a non-numeric at is rejected',
    mode: 'granted',
    nonEnvelope: true,
    run: expectAccepted([badUsageEvent({ at: 'now' })], 0, 'a non-numeric at'),
  });
  checks.push({
    id: 'port · recordUsage: a non-numeric enteredAt is rejected',
    mode: 'granted',
    nonEnvelope: true,
    run: expectAccepted([{ ...usageDwell, enteredAt: 'then' } as unknown as UsageEvent], 0, 'a non-numeric enteredAt'),
  });
  checks.push({
    id: 'port · recordUsage: a negative dwellMs is rejected',
    mode: 'granted',
    nonEnvelope: true,
    run: expectAccepted([{ ...usageDwell, dwellMs: -1 }], 0, 'a negative dwellMs'),
  });
  // Checklist §4 clock constraint: the ±10 min window is on the test runner's clock, compared against the
  // server's receive stamps — keep runner and server within a few minutes (NTP). The 1970-01-01 window must
  // still answer ok (zero) on a retention-limited server.
  //
  // Sequential (#152 round D): the harness guarantees only that the granted actor may record `ports.usage`,
  // so the probe records under `asGranted` and reads the summaries under `asConsole`. It must run alone —
  // never inside a concurrent granted/console batch, where switching actors would race the batch's role.
  checks.push({
    id: 'port · usageSummary counts by receive time, not the client at',
    mode: 'sequential',
    run: async () => {
      const visitsOf = (r: ApiResponse<UsageSummary>): number => r.data?.menus.find(m => m.menuId === ports.usage.menuId)?.visits ?? 0;
      const t0 = Date.now();
      const receiveWindow = { from: t0 - 10 * 60_000, to: t0 + 10 * 60_000 };
      const before = await harness.asConsole(() => adapter.usageSummary(receiveWindow));
      if (before.outcome !== 'ok') return `the window summary: expected ok, got ${describeResponse(before)}`;
      // Epoch 0 is a finite number — shape-valid (checklist §5); only the receive time may place it.
      // recordUsage is fire-and-forget (checklist §2): it may reject — report that, not a missing envelope.
      let recorded: { accepted: number };
      try {
        recorded = await harness.asGranted(() => adapter.recordUsage([{ ...usageEntry, at: 0 }]));
      } catch (error) {
        return `recordUsage threw/rejected: ${String(error)}`;
      }
      if (recorded.accepted !== 1) return `the epoch-0 entry: expected accepted 1, got ${recorded.accepted}`;
      const after = await harness.asConsole(() => adapter.usageSummary(receiveWindow));
      if (after.outcome !== 'ok') return `the window summary after recording: expected ok, got ${describeResponse(after)}`;
      // ≥, not ===: a shared test server may receive other visits for this menu meanwhile.
      if (visitsOf(after) < visitsOf(before) + 1) {
        return `the epoch-0 entry was not counted in its receive-time window (${visitsOf(after)} after vs ${visitsOf(before)} before)`;
      }
      const epochDay = await harness.asConsole(() => adapter.usageSummary({ from: 0, to: 86_400_000 }));
      if (epochDay.outcome !== 'ok') return `the 1970-01-01 summary: expected ok, got ${describeResponse(epochDay)}`;
      const there = epochDay.data?.menus.find(m => m.menuId === ports.usage.menuId);
      if (there && there.visits > 0) {
        return 'the epoch-0 entry was counted on 1970-01-01 — the aggregate uses the client at, not the server receive time (checklist §5)';
      }
      return null;
    },
  });
  // Client error reports (checklist §2 fire-and-forget): identity fields only — no URL, no Context value, no
  // free-text message. The sample-accepted check is the positive control: a server that rejects everything would
  // pass every rejection check, so that one must fail it.
  const badErrorReport = (patch: Record<string, unknown>): ClientErrorReport => ({ ...ports.clientError, ...patch }) as unknown as ClientErrorReport;
  const expectReported = (report: ClientErrorReport, accepted: boolean, why: string) => async () => {
    const r = await adapter.reportClientError(report);
    return r.accepted === accepted ? null : `${why}: expected accepted ${accepted}, got ${r.accepted}`;
  };
  checks.push({
    id: 'port · reportClientError accepts the sample',
    mode: 'granted',
    nonEnvelope: true,
    run: expectReported(ports.clientError, true, 'the sample report is the declared wire shape'),
  });
  // Same space rule as recordUsage: clone the sample with spaceId null, and reject the removed id and any unknown string.
  checks.push({
    id: 'port · reportClientError accepts a global menu (spaceId null)',
    mode: 'granted',
    nonEnvelope: true,
    run: expectReported({ ...ports.clientError, spaceId: null }, true, 'a global menu (spaceId null)'),
  });
  checks.push({
    id: 'port · reportClientError: spaceId feedback is rejected',
    mode: 'granted',
    nonEnvelope: true,
    run: expectReported(badErrorReport({ spaceId: 'feedback' }), false, 'the removed feedback space id'),
  });
  checks.push({
    id: 'port · reportClientError: an unknown spaceId is rejected',
    mode: 'granted',
    nonEnvelope: true,
    run: expectReported(badErrorReport({ spaceId: 'nope' }), false, 'an unknown space id'),
  });
  checks.push({
    id: 'port · reportClientError: an unknown key (free-text message) is rejected',
    mode: 'granted',
    nonEnvelope: true,
    run: expectReported(badErrorReport({ message: 'Cannot read properties of undefined (lot L-123)' }), false, 'a free-text message is an unknown key'),
  });
  checks.push({
    id: 'port · reportClientError: an absolute URL path is rejected',
    mode: 'granted',
    nonEnvelope: true,
    run: expectReported(badErrorReport({ path: 'https://example.com/equipment' }), false, 'an absolute URL — only the app-relative manifest route pattern travels'),
  });
  checks.push({
    id: 'port · reportClientError: a path with a query is rejected',
    mode: 'granted',
    nonEnvelope: true,
    run: expectReported(badErrorReport({ path: `${ports.clientError.path}?scopeId=MEM` }), false, 'a path with a query string'),
  });
  checks.push({
    id: 'port · reportClientError: a free-text name is rejected',
    mode: 'granted',
    nonEnvelope: true,
    run: expectReported(badErrorReport({ name: 'TypeError: lot L-123 missing' }), false, 'a free-text name — name is identifier-shaped only'),
  });
  const { name: _reportedName, ...reportWithoutName } = ports.clientError;
  checks.push({
    id: 'port · reportClientError: a missing field is rejected',
    mode: 'granted',
    nonEnvelope: true,
    run: expectReported(reportWithoutName as ClientErrorReport, false, 'a report missing its name'),
  });
  return checks;
}

/** Runs every planned check: granted checks concurrently as the granted actor, then console checks concurrently as the console actor, then sequential checks one at a time (each switching actors itself), then permission checks one at a time. Skipped checks are not run — they stay visible in the returned list by id. */
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
