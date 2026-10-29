import { instantEpochMs, PREFERENCE_KEYS_MAX, PREFERENCE_REQUEST_MAX_BYTES, PREFERENCE_VALUE_MAX_BYTES, type ApiResponse, type JsonValue, type PlatformAdapter, type PreferencesSnapshot } from '@ap/contracts';
import { collectLegacyPreferences, type LegacyCandidates } from './preferenceLegacy';

export type PreferenceStatus = 'loading' | 'ready' | 'failed';
/** The reason of the last failure; `null` while healthy. Safe to show: it carries no server text. */
export type PreferenceFailure = 'read' | 'import' | 'import_too_large' | 'import_unavailable' | 'write' | null;

export type PreferenceState = { status: PreferenceStatus; failure: PreferenceFailure; version: number };

/** Server-held account preferences of ONE session user (ADR-0098). One controller = one generation: a new adapter, user or revision gets a new one. */
export type PreferenceController = {
  readonly state: () => PreferenceState;
  readonly subscribe: (listener: () => void) => () => void;
  /** The effective value (pending > in flight > server); `undefined` when absent or not loaded yet. */
  readonly get: (key: string) => JsonValue | undefined;
  readonly set: (key: string, value: JsonValue) => void;
  readonly remove: (key: string) => void;
  /** Table keys (`columns:h1_<sha256>`) are derived asynchronously; `null` when WebCrypto is unavailable. */
  readonly tableKey: (rawKey: string) => Promise<string | null>;
  readonly setTable: (rawKey: string, value: JsonValue) => void;
  readonly start: () => void;
  readonly stop: () => void;
  /** Retry the failed step (read, import or write). */
  readonly retry: () => void;
};

/** Kernel-internal extension (not exported from the package): an ordered, value-independent edit of one key. Before the account's value is known the edit waits on the account lane (it survives controller replacement and remount of the SAME adapter + user) and is applied in order to the value the server (or the import) delivers. */
export type PreferenceUpdate = { readonly key: string; readonly apply: (current: JsonValue | undefined) => JsonValue };
export type UpdatingPreferenceController = PreferenceController & { readonly update: (key: string, apply: PreferenceUpdate['apply']) => void };

export type PreferenceControllerOptions = {
  adapter: PlatformAdapter;
  userId: string;
  /** Test seam: the SHA-256 of UTF-8 bytes as a lowercase hex string; defaults to WebCrypto. */
  sha256?: (text: string) => Promise<string>;
  storage?: () => Storage | null;
};

const TABLE_PREFIX = 'columns:h1_';

export async function webCryptoSha256(text: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('webcrypto_unavailable');
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function jsonDepthOk(value: unknown, depth = 1): boolean {
  if (depth > 32) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(v => jsonDepthOk(v, depth + 1));
  if (typeof value === 'object') return Object.values(value as object).every(v => jsonDepthOk(v, depth + 1));
  return false;
}
const bytes = (text: string) => new TextEncoder().encode(text).length;

/** Is the complete import request inside the server limits? Used BEFORE sending, so nothing is sent partially. */
export function importFits(serverKeys: readonly string[], values: Record<string, JsonValue>): boolean {
  const keys = Object.keys(values);
  if (new Set([...serverKeys, ...keys]).size > PREFERENCE_KEYS_MAX) return false;
  for (const value of Object.values(values)) {
    if (!jsonDepthOk(value) || bytes(JSON.stringify(value)) > PREFERENCE_VALUE_MAX_BYTES) return false;
  }
  return bytes(JSON.stringify({ values })) <= PREFERENCE_REQUEST_MAX_BYTES;
}

/** `seq` is taken at the moment of the user's intent (before any async hashing), so the newest intent wins across controller generations. */
type Intent = { remove: boolean; value?: JsonValue; seq: number };
type Batch = Map<string, Intent>;
type SendResult = { status: 'ok'; snapshot: PreferencesSnapshot; stamp: number } | { status: 'skipped' } | { status: 'failed' };

/**
 * What every controller generation of ONE adapter + account shares: the logical order of intents, the intent that no controller could
 * send, the controller that is running now (it receives late intent and every server answer), the intent being dispatched right now (`flying`: its sender owns it
 * until it settles, so nobody adopts it a second time) and the write queue (patches of this account never overlap). `clock` orders server answers by arrival.
 */
type Lane = { seq: number; clock: number; applied: Map<string, number>; parked: Batch; flying: Batch; active: ((batch: Batch) => void) | null; receive: ((values: Record<string, JsonValue>, stamp: number) => void) | null; chain: Promise<unknown>; writes: number; rawTable: Map<string, { value: JsonValue; seq: number }>; queued: PreferenceUpdate[]; poke: (() => void) | null };
const lanes = new WeakMap<PlatformAdapter, Map<string, Lane>>();
function laneOf(adapter: PlatformAdapter, userId: string): Lane {
  let byUser = lanes.get(adapter);
  if (!byUser) { byUser = new Map(); lanes.set(adapter, byUser); }
  let lane = byUser.get(userId);
  if (!lane) { lane = { seq: 0, clock: 0, applied: new Map(), parked: new Map(), flying: new Map(), active: null, receive: null, chain: Promise.resolve(), writes: 0, rawTable: new Map(), queued: [], poke: null }; byUser.set(userId, lane); }
  return lane;
}
const newer = (existing: Intent | undefined, incoming: Intent) => existing === undefined || existing.seq < incoming.seq;

const isPlainObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

const validInstant = (v: unknown): boolean => { if (typeof v !== 'string') return false; try { instantEpochMs(v); return true; } catch { return false; } };

/** A response is accepted only with the complete snapshot shape: plain record of valid JSON values inside the server bounds and `importedAt` as null or a contract-valid zoned ISO instant. */
function validSnapshot(data: unknown): data is PreferencesSnapshot {
  if (!isPlainObject(data) || !('values' in data) || !('importedAt' in data)) return false;
  const { values, importedAt } = data;
  if (importedAt !== null && !validInstant(importedAt)) return false;
  if (!isPlainObject(values)) return false;
  const entries = Object.entries(values);
  if (entries.length > PREFERENCE_KEYS_MAX) return false;
  return entries.every(([, v]) => jsonDepthOk(v) && bytes(JSON.stringify(v)) <= PREFERENCE_VALUE_MAX_BYTES);
}
const okSnapshot = (r: ApiResponse<PreferencesSnapshot>): PreferencesSnapshot | null => (r.outcome === 'ok' && validSnapshot(r.data) ? r.data : null);

export function createPreferenceController({ adapter, userId, sha256 = webCryptoSha256, storage = () => { try { return localStorage; } catch { return null; } } }: PreferenceControllerOptions): UpdatingPreferenceController {
  let generation = 0;
  let started = false;
  let status: PreferenceStatus = 'loading';
  let failure: PreferenceFailure = null;
  let version = 0;
  let server: Record<string, JsonValue> = {};
  let importedAt: string | null = null;
  let loaded = false;
  // Arrival order of the newest server answer applied here; an older answer never replaces a newer one.
  let serverStamp = 0;
  // Local intent, newest wins: `pending` was not sent yet, `sending` is in flight.
  let pending = new Map<string, Intent>();
  let sending = new Map<string, Intent>();
  let writing = false;
  let abort: AbortController | null = null;
  const listeners = new Set<() => void>();
  const hashes = new Map<string, Promise<string | null>>();
  let tableChain: Promise<void> = Promise.resolve();
  let snapshotState: PreferenceState = { status, failure, version };
  // Set by stop(), cleared by start(): the controller is gone (or replaying), so a late write cannot use the queue.
  let released = false;
  const lane = laneOf(adapter, userId);
  // The adapter sends under ITS current session: only the account this controller was made for may be written.
  const sessionMatches = () => { try { return adapter.session().user.id === userId; } catch { return false; } };
  const canSendDetached = () => loaded && importedAt !== null && sessionMatches();
  const toBody = (batch: Batch) => {
    const set: Record<string, JsonValue> = {};
    const remove: string[] = [];
    for (const [key, intent] of batch) { if (intent.remove) remove.push(key); else set[key] = intent.value as JsonValue; }
    return { ...(Object.keys(set).length ? { set } : {}), ...(remove.length ? { remove } : {}) };
  };
  /** One write of this account at a time, whichever generation sends it. Superseded intent is dropped; another account's session never sends. */
  const send = (batch: Batch): Promise<SendResult> => {
    for (const [key, intent] of batch) if (newer(lane.flying.get(key), intent)) lane.flying.set(key, intent);
    lane.writes++;
    const slot = lane.chain.then(async (): Promise<SendResult> => {
      try {
        const live: Batch = new Map();
        for (const [key, intent] of batch) if ((lane.applied.get(key) ?? 0) <= intent.seq) live.set(key, intent);
        if (live.size === 0) return { status: 'skipped' };
        if (!sessionMatches()) return { status: 'failed' };
        try {
          const snapshot = okSnapshot(await adapter.patchPreferences(toBody(live)));
          if (!snapshot) return { status: 'failed' };
          // The confirmed answer goes to whichever controller runs now, not only to the one that sent it.
          const stamp = ++lane.clock;
          lane.receive?.(snapshot.values, stamp);
          return { status: 'ok', snapshot, stamp };
        } catch { return { status: 'failed' }; }
      } finally {
        for (const [key, intent] of batch) if (lane.flying.get(key) === intent) lane.flying.delete(key);
        lane.writes--;
      }
    });
    lane.chain = slot.catch(() => undefined);
    return slot;
  };
  /** Intent no running controller owns: handed to the active controller of this account, else parked (never silently dropped) and, optionally, sent detached. */
  const releaseIntent = (batch: Batch, detach = true) => {
    if (batch.size === 0) return;
    if (lane.active) { lane.active(batch); return; }
    for (const [key, intent] of batch) if (newer(lane.parked.get(key), intent)) lane.parked.set(key, intent);
    if (!detach || !canSendDetached()) return;
    const sentBatch = new Map(batch);
    void send(sentBatch).then(result => {
      // A failed dispatch goes to the running controller once; with none it stays parked for the next one.
      if (result.status === 'failed') { if (lane.active) { const mine = new Map([...sentBatch].filter(([key, intent]) => lane.parked.get(key) === intent)); for (const key of mine.keys()) lane.parked.delete(key); lane.active(mine); } return; }
      for (const [key, intent] of sentBatch) if (lane.parked.get(key) === intent) lane.parked.delete(key);
    });
  };
  /** Late intent for the running controller: the newest intent per key wins, then it is sent as soon as this controller is ready. */
  const adopt = (batch: Batch) => {
    let changed = false;
    for (const [key, intent] of batch) {
      if ((lane.applied.get(key) ?? 0) > intent.seq) continue;
      if (lane.flying.get(key) === intent) continue;
      if (!newer(pending.get(key) ?? sending.get(key), intent)) continue;
      pending.set(key, intent);
      changed = true;
    }
    if (!changed) return;
    emit();
    void flush(generation);
  };

  const emit = () => {
    version++;
    snapshotState = { status, failure, version };
    for (const l of [...listeners]) l();
  };
  const setHealth = (nextStatus: PreferenceStatus, nextFailure: PreferenceFailure) => {
    status = nextStatus;
    failure = nextFailure;
    emit();
  };
  // Every stage after an await asks this: a stale generation OR an adapter whose session already moved to another account must not read, send or apply anything.
  const current = (gen: number) => gen === generation && started && sessionMatches();

  /** A server answer that arrived after the one shown here (a patch confirmed by an earlier generation, say) becomes the server value. */
  const receive = (values: Record<string, JsonValue>, stamp: number) => {
    if (!loaded || stamp <= serverStamp || !sessionMatches()) return;
    server = values;
    serverStamp = stamp;
    emit();
  };

  const effective = (key: string): JsonValue | undefined => {
    const intent = pending.get(key) ?? sending.get(key) ?? lane.flying.get(key);
    if (intent) return intent.remove ? undefined : intent.value;
    return server[key];
  };

  const flush = async (gen: number) => {
    if (writing || !current(gen) || status !== 'ready' || pending.size === 0) return;
    writing = true;
    const batch = pending;
    pending = new Map();
    sending = batch;
    const result = await send(batch);
    writing = false;
    if (sending === batch) sending = new Map();
    if (!current(gen)) {
      // The controller was stopped (or replayed) while the patch was in flight: the patch settled in order, a failure goes on to the account's next owner.
      if (result.status === 'failed') releaseIntent(batch, false);
      if (started) void flush(generation);
      return;
    }
    if (result.status !== 'failed') {
      if (result.status === 'ok') receive(result.snapshot.values, result.stamp);
      if (failure === 'write') failure = null;
      emit();
      void flush(gen);
    } else {
      // Keep the intent for a retry; anything the user changed since wins over the failed batch.
      for (const [key, intent] of batch) if (!pending.has(key)) pending.set(key, intent);
      setHealth('ready', 'write');
    }
  };

  const convertLegacy = async (): Promise<LegacyCandidates> => {
    const store = storage();
    if (!store) return { values: {}, failed: false };
    return collectLegacyPreferences(store, userId, rawKey => ensureHash(rawKey));
  };

  const ensureHash = (rawKey: string): Promise<string | null> => {
    let hit = hashes.get(rawKey);
    if (!hit) {
      const attempt: Promise<string | null> = sha256(rawKey).then(hex => (/^[0-9a-f]{64}$/.test(hex) ? `${TABLE_PREFIX}${hex}` : null), () => null);
      hit = attempt;
      hashes.set(rawKey, attempt);
      // A failed hash is not remembered: the next ask computes it again.
      void attempt.then(key => { if (key === null && hashes.get(rawKey) === attempt) hashes.delete(rawKey); });
    }
    return hit;
  };

  const run = async (gen: number) => {
    if (!current(gen)) return;
    abort = new AbortController();
    if (!loaded) {
      // A read is dispatched only after the account's earlier writes settled: its snapshot is then newer than every write that was in flight, and no arrival clock has to guess.
      while (lane.writes > 0) await lane.chain;
      if (!current(gen)) return;
      let snapshot: PreferencesSnapshot | null = null;
      try { snapshot = okSnapshot(await adapter.readPreferences(abort.signal)); } catch { snapshot = null; }
      if (!current(gen)) return;
      // A failed first read keeps every local record and assumes nothing about the server.
      if (!snapshot) { setHealth('failed', 'read'); return; }
      server = snapshot.values;
      serverStamp = ++lane.clock;
      importedAt = snapshot.importedAt;
      loaded = true;
    }
    if (importedAt === null) {
      const legacy = await convertLegacy();
      if (!current(gen)) return;
      // A candidate that could not be converted now (no WebCrypto) is retried later; no import, no acknowledgement.
      if (legacy.failed) { setHealth('failed', 'import_unavailable'); return; }
      const missing: Record<string, JsonValue> = {};
      for (const [key, value] of Object.entries(legacy.values)) if (!(key in server)) missing[key] = value;
      if (!importFits(Object.keys(server), missing)) { setHealth('failed', 'import_too_large'); return; }
      let snapshot: PreferencesSnapshot | null = null;
      try { snapshot = okSnapshot(await adapter.importPreferences({ values: missing }, abort.signal)); } catch { snapshot = null; }
      if (!current(gen)) return;
      if (!snapshot || snapshot.importedAt === null) { setHealth('failed', 'import'); return; }
      server = snapshot.values;
      serverStamp = ++lane.clock;
      importedAt = snapshot.importedAt;
    }
    // Originals stay in the browser: the snapshot ACK cannot say which device committed the import.
    drainQueued();
    setHealth('ready', null);
    drainRaw();
    void flush(gen);
  };

  /** Table intent whose hash failed is kept raw (with its original sequence) on the lane; this derives the key again and hands it on. */
  const drainRaw = () => {
    for (const [rawKey, entry] of [...lane.rawTable]) {
      tableChain = tableChain.then(async () => {
        if (lane.rawTable.get(rawKey) !== entry) return;
        const key = await ensureHash(rawKey);
        if (key === null || lane.rawTable.get(rawKey) !== entry) return;
        lane.rawTable.delete(rawKey);
        write(key, { remove: false, value: entry.value, seq: entry.seq });
      });
    }
  };

  const write = (key: string, intent: Intent) => {
    // A delayed older intent (a slow hash) never overrides a newer edit of the same key, in any generation.
    if ((lane.applied.get(key) ?? 0) > intent.seq) return;
    lane.applied.set(key, intent.seq);
    if (released) { releaseIntent(new Map([[key, intent]])); return; }
    pending.set(key, intent);
    emit();
    // A deliberate edit after a failed read/import tries the failed step again (a permanent too-large import never loops).
    if (started && status === 'failed' && failure !== 'import_too_large') retryNow();
    else void flush(generation);
  };

  /** Applies the waiting edits in their original order as ONE step at readiness, before any later edit can write. */
  const drainQueued = () => {
    while (lane.queued.length > 0) {
      const { key, apply } = lane.queued.shift() as PreferenceUpdate;
      write(key, { remove: false, value: apply(effective(key)), seq: ++lane.seq });
    }
  };
  const poke = () => {
    if (!started || !sessionMatches()) return;
    if (status === 'ready') drainQueued();
    else if (status === 'failed' && failure !== 'import_too_large') retryNow();
  };

  const retryNow = () => {
    if (!started || status === 'loading' || !sessionMatches()) return;
    drainRaw();
    if (status === 'failed') { generation++; setHealth('loading', null); void run(generation); return; }
    void flush(generation);
  };

  return {
    state: () => snapshotState,
    subscribe: l => { listeners.add(l); return () => { listeners.delete(l); }; },
    get: key => lane.queued.reduce<JsonValue | undefined>((value, u) => (u.key === key ? u.apply(value) : value), effective(key)),
    update(key, apply) {
      lane.queued.push({ key, apply });
      if (!started) { if (lane.poke) lane.poke(); return; }
      emit();
      poke();
    },
    set: (key, value) => write(key, { remove: false, value, seq: ++lane.seq }),
    remove: key => write(key, { remove: true, seq: ++lane.seq }),
    tableKey: ensureHash,
    setTable(rawKey, value) {
      const seq = ++lane.seq;
      tableChain = tableChain.then(async () => {
        const key = await ensureHash(rawKey);
        // A hash that finishes after stop() still reaches write(), which parks or sends it for its own account.
        const kept = lane.rawTable.get(rawKey);
        if (key === null) {
          // Kept raw under its own sequence until hashing works; a newer edit of the same table replaces it.
          if (!kept || kept.seq < seq) lane.rawTable.set(rawKey, { value, seq });
          if (!released) setHealth(status, 'write');
          return;
        }
        if (kept && kept.seq <= seq) lane.rawTable.delete(rawKey);
        write(key, { remove: false, value, seq });
      });
    },
    start() {
      if (started) return;
      started = true;
      released = false;
      generation++;
      // Intent left by an earlier generation of this account: the newest local change still wins.
      lane.active = adopt;
      lane.receive = receive;
      lane.poke = poke;
      for (const [key, intent] of lane.parked) if (lane.flying.get(key) !== intent && newer(pending.get(key), intent) && (lane.applied.get(key) ?? 0) <= intent.seq) pending.set(key, intent);
      for (const [key, intent] of [...lane.parked]) if (lane.flying.get(key) !== intent) lane.parked.delete(key);
      status = 'loading';
      failure = null;
      emit();
      void run(generation);
    },
    stop() {
      started = false;
      generation++;
      abort?.abort();
      abort = null;
      released = true;
      if (lane.active === adopt) lane.active = null;
      if (lane.receive === receive) lane.receive = null;
      if (lane.poke === poke) lane.poke = null;
      // A batch already sent settles in order and reports to the next owner itself (flush); the unsent queue is handed on now.
      const leftover = pending;
      pending = new Map();
      releaseIntent(leftover);
    },
    retry: retryNow,
  };
}
