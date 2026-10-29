import type {
  ActionResponse, AnyActionSpec, AnyEndpointSpec, ClientErrorReport, EntityRef, GlobalContext, Permission, PlatformAdapter, UsageEvent,
} from '@ap/contracts';
import type { OptionPortSamples } from './plan/ports/selection-ports';
export type { OptionPortSamples } from './plan/ports/selection-ports';

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
  /**
   * Optional: the `userId` of a person the granted session can see (it may be the session's own id). The lookupPeople check
   * requires `lookupPeople([id, unknown])` to return exactly that person with the exact `GroupMember` shape; without it the
   * check can only prove shape and absence, so an always-empty implementation passes — it ends as a run-time skip with this reason.
   */
  visiblePersonId?: string;
};

/** One `PlatformAdapter` member — the unit a server declares as implemented (#674). */
export type PortMethod = keyof PlatformAdapter;

export type ServerConformanceHarness = {
  adapter: PlatformAdapter;
  /**
   * The port methods this server implements (#674). Absent = every method. A check that calls a method outside the
   * list is planned as skipped with ` — not implemented: <methods>` in its id: the gap stays visible (a readiness
   * table), never a pass and never a failure.
   */
  implemented?: readonly PortMethod[];
  /**
   * False when the server grants no sites yet (`session().scopes` is `[]` — the feature backend until site·room
   * grants exist, ADR-0069 decision 8). Every check that needs a granted site is then planned as skipped with
   * ` — no site grants` — every check of a Scope-requiring endpoint or action among them (each request carries
   * `context.scopeId`) — so `context.scopeId`, `foreignScopeId` and `ports.otherGrantedScopeId` are placeholders no run
   * check sends. Default true.
   */
  siteGrants?: boolean;
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
  /** The port methods `run` calls; a method outside `harness.implemented` turns the check into a skipped one. */
  uses?: readonly PortMethod[];
  /** The check needs a granted site; `harness.siteGrants: false` turns it into a skipped one. */
  needsSites?: boolean;
  /** null = conforms, a string = the reason it does not, `{ skipped }` = the run found a precondition missing (a visible skip, never a pass). */
  run: () => Promise<string | null | ConformanceSkipped>;
};
/** A check that decided at run time it has nothing to judge (e.g. a server that does not page `entityAudit`). */
export type ConformanceSkipped = { skipped: string };

/** `skipped`: planned but not run (e.g. no oversize sample) — never counted as a pass. `failure` is null unless `failed`. */
export type ConformanceResult = { id: string; status: 'passed' | 'failed' | 'skipped'; failure: string | null; /** Why a run-time skip happened; plan-time skips say it in the id. */ reason?: string };
