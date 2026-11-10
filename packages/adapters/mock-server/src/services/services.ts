/**
 * Preferences, people lookup and notices (ADR-0098). Module-level stores like annotations and usage: they survive `setRole`,
 * keyed by the session user, so one role never reads or writes another role's data. The role is pinned when the request is sent,
 * so a switch while a call is in flight cannot make it write into the later user's data. No input carries an identity: an unknown
 * key (a forged `userId`, `author`, `at`) rejects the call.
 */
import { PEOPLE_LOOKUP_MAX, PREFERENCE_KEYS_MAX, PREFERENCE_KEY_PATTERN, PREFERENCE_REQUEST_MAX_BYTES, PREFERENCE_VALUE_MAX_BYTES, PortError } from '@ap/contracts';
import type { ActionResponse, ApiResponse, DeleteNoticeInput, FieldError, GroupMember, JsonValue, Notice, NoticeListPage, PreferencesImport, PreferencesPatch, PreferencesSnapshot, SaveNoticeInput } from '@ap/contracts';
import { checkScope, getRole, getScenario, nextCorrelation, sleep } from '../server';
import { activeWorld, type RoleId } from '../world';

export type ServiceOptions = { role?: RoleId; latency?: number };
const DEFAULT_LATENCY_MS = 80;

type Base = { correlationId: string; data: null; trust: null; assessments: [] };
type Pinned = { role: RoleId; userId: string; scenario: ReturnType<typeof getScenario> };

/** Identity and scenario are read at send time, before the wait. */
function pin(opts?: ServiceOptions): Pinned {
  const role = opts?.role ?? getRole();
  return { role, userId: activeWorld().users[role].role, scenario: getScenario() };
}
const wait = (pinned: Pinned, signal: AbortSignal | undefined, opts?: ServiceOptions) => sleep((opts?.latency ?? DEFAULT_LATENCY_MS) + (pinned.scenario === 'slow' ? 2200 : 0), signal);
const baseOf = (): Base => ({ correlationId: nextCorrelation(), data: null, trust: null, assessments: [] });

/** The scenario outcome an envelope read answers before looking at the request, or null for normal service. */
function scenarioFail(scenario: Pinned['scenario']): { outcome: 'timeout' | 'error' | 'forbidden'; message: string } | null {
  if (scenario === 'timeout') return { outcome: 'timeout', message: '조회가 30초 제한을 넘었습니다' };
  if (scenario === 'error') return { outcome: 'error', message: '상류 요청이 실패했습니다' };
  if (scenario === 'forbidden') return { outcome: 'forbidden', message: '권한이 회수되었습니다(시나리오)' };
  return null;
}

/** Deterministic serialization: object keys sorted at every depth, so equal input is equal text whatever its key order. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isPlain(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
const isPlain = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const onlyKeys = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).every(key => keys.includes(key));
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value) ?? '').length;
function isJson(value: unknown, depth = 0): value is JsonValue {
  if (depth > 32) return false;
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(item => isJson(item, depth + 1));
  return isPlain(value) && Object.values(value).every(item => isJson(item, depth + 1));
}

// ───────────────────────────── preferences ─────────────────────────────

type PrefStore = { values: Map<string, JsonValue>; importedAt: string | null };
const prefs = new Map<string, PrefStore>();
const storeOf = (userId: string): PrefStore => {
  let store = prefs.get(userId);
  if (!store) { store = { values: new Map(), importedAt: null }; prefs.set(userId, store); }
  return store;
};
const snapshotOf = (store: PrefStore): PreferencesSnapshot => ({ values: Object.fromEntries(store.values), importedAt: store.importedAt });
export function resetPreferences() { prefs.clear(); }

type Verdict = { message: string; outcome: 'error' | 'too_large' } | null;
/** The value map of a `set`/`values` field: keys in the grammar, values JSON and each within its size bound. */
function checkValues(values: unknown): Verdict {
  if (!isPlain(values)) return { outcome: 'error', message: 'values must be an object' };
  const keys = Object.keys(values);
  if (keys.length > PREFERENCE_KEYS_MAX) return { outcome: 'too_large', message: `at most ${PREFERENCE_KEYS_MAX} keys` };
  for (const key of keys) {
    if (!PREFERENCE_KEY_PATTERN.test(key)) return { outcome: 'error', message: `key ${key} is not a preference key` };
    if (!isJson(values[key])) return { outcome: 'error', message: `value of ${key} is not JSON` };
    if (bytes(values[key]) > PREFERENCE_VALUE_MAX_BYTES) return { outcome: 'too_large', message: `value of ${key} is over ${PREFERENCE_VALUE_MAX_BYTES} bytes` };
  }
  return null;
}
function checkPatch(patch: unknown): Verdict {
  if (!isPlain(patch) || !onlyKeys(patch, ['set', 'remove'])) return { outcome: 'error', message: 'patch has unknown keys' };
  if (patch['set'] !== undefined) { const bad = checkValues(patch['set']); if (bad) return bad; }
  const remove = patch['remove'];
  if (remove !== undefined) {
    if (!Array.isArray(remove) || remove.length > PREFERENCE_KEYS_MAX || remove.some(key => typeof key !== 'string' || !PREFERENCE_KEY_PATTERN.test(key))) return { outcome: 'error', message: 'remove must list preference keys' };
    if (new Set(remove).size !== remove.length) return { outcome: 'error', message: 'remove has duplicates' };
    if (isPlain(patch['set']) && remove.some(key => Object.hasOwn(patch['set'] as object, key))) return { outcome: 'error', message: 'set and remove share a key' };
  }
  return bytes(patch) > PREFERENCE_REQUEST_MAX_BYTES ? { outcome: 'too_large', message: 'request is too large' } : null;
}
/** The account total is bounded too (ADR-0098 §1): the state after the change, not the request alone, must fit, or nothing changes. */
const overCap = (count: number): Verdict => (count > PREFERENCE_KEYS_MAX ? { outcome: 'too_large', message: `an account holds at most ${PREFERENCE_KEYS_MAX} keys` } : null);
function projectPatch(patch: PreferencesPatch, store: PrefStore): Verdict {
  const next = new Set(store.values.keys());
  for (const key of patch.remove ?? []) next.delete(key);
  for (const key of Object.keys(patch.set ?? {})) next.add(key);
  return overCap(next.size);
}
function projectImport(input: PreferencesImport, store: PrefStore): Verdict {
  if (store.importedAt !== null) return null;
  return overCap(new Set([...store.values.keys(), ...Object.keys(input.values)]).size);
}
function checkImport(input: unknown): Verdict {
  if (!isPlain(input) || !onlyKeys(input, ['values'])) return { outcome: 'error', message: 'import has unknown keys' };
  return checkValues(input['values']) ?? (bytes(input) > PREFERENCE_REQUEST_MAX_BYTES ? { outcome: 'too_large', message: 'request is too large' } : null);
}

async function prefsCall(opts: ServiceOptions | undefined, signal: AbortSignal | undefined, judge: (store: PrefStore) => Verdict, run: (store: PrefStore) => void): Promise<ApiResponse<PreferencesSnapshot>> {
  const pinned = pin(opts);
  await wait(pinned, signal, opts);
  const base = baseOf();
  const failed = scenarioFail(pinned.scenario);
  if (failed) return { ...base, ...failed };
  const store = storeOf(pinned.userId);
  const verdict = judge(store);
  if (verdict) return { ...base, ...verdict };
  run(store);
  return { ...base, outcome: 'ok', data: snapshotOf(store) };
}

export const readPreferences = (signal?: AbortSignal, opts?: ServiceOptions) => prefsCall(opts, signal, () => null, () => undefined);

export const patchPreferences = (patch: PreferencesPatch, signal?: AbortSignal, opts?: ServiceOptions) =>
  prefsCall(opts, signal, store => checkPatch(patch) ?? projectPatch(patch, store), store => {
    for (const key of patch.remove ?? []) store.values.delete(key);
    for (const [key, value] of Object.entries(patch.set ?? {})) store.values.set(key, value);
  });

/** The only write that stamps `importedAt`; after it the call changes nothing, so a key deleted later stays deleted. */
export const importPreferences = (input: PreferencesImport, signal?: AbortSignal, opts?: ServiceOptions) =>
  prefsCall(opts, signal, store => checkImport(input) ?? projectImport(input, store), store => {
    if (store.importedAt !== null) return;
    for (const [key, value] of Object.entries(input.values)) if (!store.values.has(key)) store.values.set(key, value);
    store.importedAt = new Date().toISOString();
  });

// ───────────────────────────── people ─────────────────────────────

/** Exact lookup by opaque id. The mock directory is the world's users; a missing id is absent, never an error or a placeholder. */
export async function lookupPeople(ids: readonly string[], signal?: AbortSignal, opts?: ServiceOptions): Promise<readonly GroupMember[]> {
  const pinned = pin(opts);
  await wait(pinned, signal, opts);
  if (!Array.isArray(ids) || ids.length > PEOPLE_LOOKUP_MAX || ids.some(id => typeof id !== 'string' || id.length === 0)) throw new PortError('invalid_input', `ids must be at most ${PEOPLE_LOOKUP_MAX} non-empty strings`, 'ids');
  if (new Set(ids).size !== ids.length) throw new PortError('invalid_input', 'ids must be distinct', 'ids');
  const users = Object.values(activeWorld().users);
  return ids.flatMap(id => {
    const user = users.find(candidate => candidate.role === id);
    return user ? [{ userId: user.role, displayName: user.name, affiliation: user.title.en }] : [];
  });
}

// ───────────────────────────── notices ─────────────────────────────

type StoredNotice = Notice & { revision: number; authorId: string; createdAt: string };
const SEED: readonly StoredNotice[] = [
  { id: 'N-mock-1', title: { ko: '정기 점검 안내', en: 'Scheduled maintenance' }, content: { ko: '이번 주말 점검이 있습니다.', en: 'Maintenance this weekend.' }, scopeId: null, until: '2026-10-01T00:00:00', version: 'v1', revision: 1, authorId: 'admin', createdAt: '2026-09-20T09:00:00Z' },
  { id: 'N-mock-2', title: { ko: 'MEM 마스터 정정', en: 'MEM master correction' }, content: { ko: '지난 7일 값이 달라질 수 있습니다.', en: 'The last 7 days may change.' }, scopeId: 'MEM', until: '2026-09-01T00:00:00', version: 'v1', revision: 1, authorId: 'admin', createdAt: '2026-08-20T09:00:00Z' },
];
let notices: StoredNotice[] = SEED.map(row => ({ ...row }));
let noticeSeq = 3;
/** Idempotency records per (user, key): the request fingerprint and the answer stored for a replay. */
const replays = new Map<string, { fingerprint: string; answer: ActionResponse<Notice> | ActionResponse<{ id: string }> }>();
export function resetNotices() { notices = SEED.map(row => ({ ...row })); noticeSeq = 3; replays.clear(); }
export const storedNotices = (): readonly StoredNotice[] => notices;

const toNotice = ({ revision: _r, authorId: _a, createdAt: _c, ...notice }: StoredNotice): Notice => notice;
const hasPermission = (role: RoleId, permission: string) => (activeWorld().users[role].permissions as readonly string[]).includes(permission);
const WRITE_PERMISSION = 'console:access';

export async function listNotices(signal?: AbortSignal, opts?: ServiceOptions): Promise<ApiResponse<NoticeListPage>> {
  const pinned = pin(opts);
  await wait(pinned, signal, opts);
  const base = baseOf();
  if (!hasPermission(pinned.role, 'notice:view')) return { ...base, outcome: 'forbidden', message: 'No permission notice:view' };
  const failed = scenarioFail(pinned.scenario);
  if (failed) return { ...base, ...failed };
  // A site-targeted notice is data of that site: a user without a grant there does not read it (targeting is not authorization).
  const items = pinned.scenario === 'empty' ? [] : notices.filter(row => row.scopeId === null || checkScope(pinned.role, row.scopeId).status === 'valid').map(toNotice);
  return items.length === 0 ? { ...base, outcome: 'empty' } : { ...base, outcome: 'ok', data: { items } };
}

const DRAFT_KEYS = ['title', 'content', 'scopeId', 'until', 'idempotencyKey'] as const;
const text = (value: unknown, max: number): boolean => isPlain(value) && onlyKeys(value, ['ko', 'en']) && typeof value['ko'] === 'string' && typeof value['en'] === 'string' && value['ko'].length <= max && value['en'].length <= max;
const WALL_CLOCK = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

function checkSave(input: unknown): FieldError[] {
  if (!isPlain(input)) return [{ path: [], code: 'invalid' }];
  const errors: FieldError[] = [];
  const update = Object.hasOwn(input, 'id') || Object.hasOwn(input, 'expectedVersion');
  const allowed: readonly string[] = update ? [...DRAFT_KEYS, 'id', 'expectedVersion'] : DRAFT_KEYS;
  for (const key of Object.keys(input)) if (!allowed.includes(key)) errors.push({ path: [key], code: 'unknown_key' });
  if (update) for (const key of ['id', 'expectedVersion']) if (typeof input[key] !== 'string' || input[key] === '') errors.push({ path: [key], code: 'required' });
  if (!text(input['title'], 200)) errors.push({ path: ['title'], code: 'invalid' });
  if (!text(input['content'], 10_000)) errors.push({ path: ['content'], code: 'invalid' });
  if (input['scopeId'] !== null && (typeof input['scopeId'] !== 'string' || input['scopeId'] === '')) errors.push({ path: ['scopeId'], code: 'invalid' });
  if (typeof input['until'] !== 'string' || !WALL_CLOCK.test(input['until'])) errors.push({ path: ['until'], code: 'invalid' });
  if (typeof input['idempotencyKey'] !== 'string' || input['idempotencyKey'] === '' || input['idempotencyKey'].length > 200) errors.push({ path: ['idempotencyKey'], code: 'required' });
  return errors;
}
function checkDelete(input: unknown): FieldError[] {
  if (!isPlain(input)) return [{ path: [], code: 'invalid' }];
  const errors: FieldError[] = Object.keys(input).filter(key => !['id', 'expectedVersion', 'idempotencyKey'].includes(key)).map(key => ({ path: [key], code: 'unknown_key' }));
  for (const key of ['id', 'expectedVersion', 'idempotencyKey']) if (typeof input[key] !== 'string' || input[key] === '') errors.push({ path: [key], code: 'required' });
  return errors;
}

function answer<T>(outcome: ActionResponse<T>['outcome'], over: Partial<ActionResponse<T>> = {}): ActionResponse<T> {
  return { outcome, data: null, version: null, fieldErrors: [], replayed: false, correlationId: nextCorrelation(), ...over };
}

/** Shared write judgment: permission → scenario → shape → replay → version → apply. Never throws for a judged request. */
async function noticeWrite<T extends Notice | { id: string }>(input: unknown, signal: AbortSignal | undefined, opts: ServiceOptions | undefined, check: (input: unknown) => FieldError[], apply: (pinned: Pinned, input: Record<string, unknown>) => ActionResponse<T>): Promise<ActionResponse<T>> {
  const pinned = pin(opts);
  await wait(pinned, signal, opts);
  if (!hasPermission(pinned.role, WRITE_PERMISSION)) return answer<T>('forbidden', { message: `No permission ${WRITE_PERMISSION}` });
  if (pinned.scenario === 'error') return answer<T>('error', { message: '상류 요청이 실패했습니다' });
  if (pinned.scenario === 'forbidden') return answer<T>('forbidden', { message: '권한이 회수되었습니다(시나리오)' });
  const fieldErrors = check(input);
  if (fieldErrors.length > 0) return answer<T>('invalid', { fieldErrors });
  const body = input as Record<string, unknown>;
  const { idempotencyKey: _key, ...rest } = body;
  const recordKey = `${pinned.userId}\0${String(body['idempotencyKey'])}`;
  const fingerprint = canonical(rest);
  const seen = replays.get(recordKey);
  if (seen) {
    // Same key, other input is a client bug: the stored answer is for the first request only.
    if (seen.fingerprint !== fingerprint) return answer<T>('invalid', { fieldErrors: [{ path: ['idempotencyKey'], code: 'reused' }] });
    return { ...(seen.answer as ActionResponse<T>), replayed: true };
  }
  const result = apply(pinned, body);
  if (result.outcome === 'ok') replays.set(recordKey, { fingerprint, answer: result });
  return result;
}

export const saveNotice = (input: SaveNoticeInput, signal?: AbortSignal, opts?: ServiceOptions): Promise<ActionResponse<Notice>> =>
  noticeWrite<Notice>(input, signal, opts, checkSave, (pinned, body) => {
    const draft = { title: body['title'] as Notice['title'], content: body['content'] as Notice['content'], scopeId: body['scopeId'] as string | null, until: body['until'] as string };
    if (typeof body['id'] !== 'string') {
      const stored: StoredNotice = { ...draft, id: `N-mock-${noticeSeq++}`, version: 'v1', revision: 1, authorId: pinned.userId, createdAt: new Date().toISOString() };
      notices = [...notices, stored];
      return answer('ok', { data: toNotice(stored), version: stored.version });
    }
    const index = notices.findIndex(row => row.id === body['id']);
    if (index < 0) return answer('not_found');
    const current = notices[index]!;
    if (current.version !== body['expectedVersion']) return answer('conflict', { version: current.version });
    const revision = current.revision + 1;
    const stored: StoredNotice = { ...current, ...draft, revision, version: `v${revision}` };
    notices = notices.map((row, i) => (i === index ? stored : row));
    return answer('ok', { data: toNotice(stored), version: stored.version });
  });

export const deleteNotice = (input: DeleteNoticeInput, signal?: AbortSignal, opts?: ServiceOptions): Promise<ActionResponse<{ id: string }>> =>
  noticeWrite<{ id: string }>(input, signal, opts, checkDelete, (_pinned, body) => {
    const current = notices.find(row => row.id === body['id']);
    if (!current) return answer('not_found');
    if (current.version !== body['expectedVersion']) return answer('conflict', { version: current.version });
    notices = notices.filter(row => row !== current);
    return answer('ok', { data: { id: current.id }, version: current.version });
  });
