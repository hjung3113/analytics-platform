import type { ActionResponse, ActionSpec, FieldError } from '@ap/contracts';
import { checkScope, getRole, nextCorrelation, sleep } from '../server';
import { activeWorld, type RoleId } from '../world';

type ActionInput<I> = { input: I; actor: RoleId; scopeId: string | null };

/** A menu's mock handler for one declared action (docs/adr/0054). Lives in the menu's `src/mock/` like endpoint handlers. */
export type MockAction<I, T> = {
  spec: ActionSpec<I, T>;
  /** Current version of the target; `null` = target missing (`not_found`). Required when `spec.concurrency` is `version`. */
  version?: (input: ActionInput<I>) => string | null;
  /**
   * Optional right check that depends on the input, like the real server's `authorize(actor, tx, input)` (e.g. a write at a wider level
   * needs one more permission). Runs right after the declared permission and Scope checks; `false` answers `forbidden`. `can` reads the
   * acting role's permissions. Without it only `spec.permission` is judged.
   */
  authorize?: (args: { input: I; can(permission: string): boolean }) => boolean;
  /** Value check the allow-list cannot express; returns field errors (empty = valid). Runs after the replay check. */
  validate?: (input: I) => readonly FieldError[];
  /** Applies the write and returns the new data and version. The handler owns its domain audit, like the real server:
   * the engine writes no audit row itself, and the actor is never input (`unexpected_field` rejects an actor or time key).
   * A row-dependent refusal (illegal after the version check) throws `MockActionInvalid` with field errors. */
  handle: (input: ActionInput<I>) => { data: T; version: string | null };
};

export const defineMockAction = <I, T>(spec: ActionSpec<I, T>, impl: Omit<MockAction<I, T>, 'spec'>): MockAction<I, T> => ({ spec, ...impl });

/**
 * A handler's refusal that mirrors the real server's `MenuActionInvalidError`-from-`handle` path: the request passed
 * `validate` and the version check (a stale request conflicts first), but the row state the handler found refuses the
 * write. The engine answers `invalid` with these field errors and records nothing.
 */
export class MockActionInvalid extends Error {
  readonly fieldErrors: readonly FieldError[];
  constructor(fieldErrors: readonly FieldError[]) {
    super('invalid');
    this.name = 'MockActionInvalid';
    this.fieldErrors = fieldErrors;
  }
}

/** Heterogeneous list (I invariant, see AnyActionSpec). */
export type AnyMockAction = MockAction<any, any>;

const requestKeys = ['action', 'context', 'input', 'idempotencyKey'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Stored = { hash: string; response: ActionResponse<unknown> };
/**
 * Replay records per action registry (one per mock adapter), keyed `(actor, key)`. Only `ok` is recorded. The mock
 * keeps records for the life of the registry: the real server's retention (24 hours or more, ADR-0054) is its own.
 */
const records = new WeakMap<object, Map<string, Stored>>();

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

const MAX_DEPTH = 64;
/** Stable text of a request value: object keys sorted, array holes `null` like JSON. Throws on BigInt, cycles and depth over 64. */
const canonical = (value: unknown, depth = 0): string => {
  if (depth > MAX_DEPTH) throw new Error('input nested too deep');
  if (Array.isArray(value)) return `[${Array.from({ length: value.length }, (_, i) => canonical(value[i], depth + 1)).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => `${JSON.stringify(k)}:${canonical(value[k], depth + 1)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
};

const answer = (outcome: ActionResponse<unknown>['outcome'], rest: Partial<ActionResponse<unknown>> = {}): ActionResponse<unknown> =>
  ({ outcome, data: null, version: null, fieldErrors: [], replayed: false, correlationId: nextCorrelation(), ...rest });

/**
 * Runs a menu action using the server-owned declaration. Judgment order (ADR-0054, real-server-checklist §3):
 * shape → key → permission → scope → authorize (optional) → replay → input → version → handler.
 */
export async function serveAction(
  actions: ReadonlyMap<string, AnyMockAction>,
  req: unknown,
  signal?: AbortSignal,
  opts?: { role?: RoleId; latency?: number },
): Promise<ActionResponse<unknown>> {
  // Pin identity at send time, like serve(): a role switch while in flight must not re-evaluate this request.
  const actor = opts?.role ?? getRole();
  const shape = (message: string) => answer('error', { message });
  if (!isPlainObject(req)) return shape('request must be a plain object');
  // An undefined value is an absent key: JSON drops it on the wire.
  const has = (key: string) => Object.prototype.hasOwnProperty.call(req, key) && req[key] !== undefined;
  const action = typeof req.action === 'string' ? actions.get(req.action) : undefined;
  const versioned = action?.spec.concurrency === 'version';
  const unexpected = Object.keys(req).filter(has).find(key => !(requestKeys as readonly string[]).includes(key) && !(key === 'expectedVersion' && versioned));
  if (unexpected) return shape(`unexpected request key ${unexpected}`);
  for (const key of ['action', 'context', 'input'] as const) if (!has(key)) return shape(`missing request key ${key}`);
  if (typeof req.action !== 'string') return shape('request action must be a string');
  if (!action) return shape(`unknown action ${req.action}`);
  const { spec } = action;
  if (!isPlainObject(req.context)) return shape('request context must be a plain object');
  const unknownContext = Object.keys(req.context).find(key => key !== 'scopeId');
  if (unknownContext) return shape(`unknown context key ${unknownContext}`);
  if (Object.prototype.hasOwnProperty.call(req.context, 'scopeId') !== spec.requiresScope) {
    return shape(spec.requiresScope ? `missing context key scopeId for ${spec.id}` : `context key scopeId is not carried by ${spec.id}`);
  }
  const scopeId = req.context.scopeId ?? null;
  if (scopeId !== null && typeof scopeId !== 'string') return shape('context scopeId must be a string or null');
  if (!isPlainObject(req.input)) return shape('request input must be a plain object');
  if (versioned !== has('expectedVersion')) {
    return shape(versioned ? `missing request key expectedVersion for ${spec.id}` : `expectedVersion is not carried by ${spec.id}`);
  }
  if (versioned && typeof req.expectedVersion !== 'string') return shape('request expectedVersion must be a string');

  const key = req.idempotencyKey;
  if (!has('idempotencyKey')) return answer('invalid', { fieldErrors: [{ path: ['idempotencyKey'], code: 'required' }] });
  if (typeof key !== 'string' || !UUID.test(key)) return answer('invalid', { fieldErrors: [{ path: ['idempotencyKey'], code: 'malformed' }] });

  await sleep(opts?.latency ?? 80, signal);
  if (!activeWorld().users[actor].permissions.includes(spec.permission)) return answer('forbidden', { message: `No permission ${spec.permission}` });
  if (spec.requiresScope) {
    const check = checkScope(actor, scopeId);
    if (check.status !== 'valid') return answer('forbidden', { message: check.status === 'forbidden' ? `No grant for scope ${scopeId}` : `Unknown scope ${scopeId}` });
  }
  if (action.authorize) {
    const held: readonly string[] = activeWorld().users[actor].permissions;
    if (!action.authorize({ input: req.input, can: (permission) => held.includes(permission) })) return answer('forbidden', { message: `No permission for this input of ${spec.id}` });
  }

  const store = records.get(actions) ?? new Map<string, Stored>();
  records.set(actions, store);
  let hash: string;
  try {
    hash = canonical({ action: spec.id, scopeId, expectedVersion: req.expectedVersion, input: req.input });
  } catch {
    return shape('input cannot be canonicalized');
  }
  const stored = store.get(`${actor}\n${key}`);
  if (stored) return stored.hash === hash ? { ...structuredClone(stored.response), replayed: true } : shape('idempotency_key_reuse');

  const unexpectedFields = Object.keys(req.input).filter(k => !Object.prototype.hasOwnProperty.call(spec.inputKeys, k));
  if (unexpectedFields.length > 0) return answer('invalid', { fieldErrors: unexpectedFields.map(k => ({ path: [k], code: 'unexpected_field' })) });
  try {
    const fieldErrors = action.validate?.(req.input) ?? [];
    if (fieldErrors.length > 0) return answer('invalid', { fieldErrors });
    const input = { input: req.input, actor, scopeId };
    if (versioned) {
      const current = action.version!(input);
      if (current === null) return answer('not_found');
      if (current !== req.expectedVersion) return answer('conflict', { version: current });
    }
    const done = action.handle(input);
    const response = answer('ok', { data: done.data, version: done.version });
    // The record is a snapshot: a later handler write or a caller mutating its answer must not change a replay.
    store.set(`${actor}\n${key}`, { hash, response: structuredClone(response) });
    return structuredClone(response);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError') throw error;
    if (error instanceof MockActionInvalid) return answer('invalid', { fieldErrors: [...error.fieldErrors] });
    return shape('action handler failed');
  }
}
