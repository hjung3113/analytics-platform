import type { SavedViewDraft, SavedViewStore } from '@ap/contracts';
import { COMMAND_MAX_BYTES, IMPORT_ROWS_MAX, isSavedViewDraft, jsonBytes, withinDepth, type ImportLocal, type SavedViewImportCommand, type SavedViewImportOutcome } from '@ap/http-adapter';

/**
 * One-time import of the legacy browser-local saved views of the signed-in actor into the server (ADR-0099 section 4).
 * Reads raw storage only: it imports neither the mock local store nor its seed, so an absent or unreadable bucket is zero rows
 * and no demo row or authority (sharing, approval, groups, original owner) ever reaches the server. Originals are never
 * removed or rewritten, even after the server acknowledged them. State lives in a per-actor manifest (stable token, the
 * exact rows offered, a receipt per row) that a crash, a retry or another tab reuses verbatim.
 */

type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'key' | 'length'>;
type Locks = { request<T>(name: string, callback: () => Promise<T>): Promise<T> };

/** The origin lock the browser-local store takes for every mutation: the importer reads and writes its manifest under it too. */
export const SAVED_VIEWS_LOCK = 'platform:saved-views:v1';
const ROWS_PREFIX = 'platform:saved-views:v1:';
const DEFAULT_PREFIX = 'platform:saved-view-default:v1:';
const MANIFEST_PREFIX = 'platform:saved-view-import:v1:';
const tuple = (...parts: (string | null)[]) => JSON.stringify([1, ...parts]);
export const importManifestKey = (actorId: string) => MANIFEST_PREFIX + tuple(actorId);

type ManifestRow = { legacyKey: string; draft: SavedViewDraft };
type ManifestDefault = { menuId: string | null; legacyKey: string };
type Receipt = { status: 'acked'; id: string } | { status: 'rejected'; reason: string };
export type ImportManifest = { schemaVersion: 1; actorId: string; token: string; rows: ManifestRow[]; defaults: ManifestDefault[]; receipts: Record<string, Receipt> };

/** `none`: nothing to import. `done`: every row has a receipt. `pending`: some rows wait for a later attempt. `unavailable`: nothing was sent (no lock, unreadable manifest, session changed). */
export type ImportReport = { status: 'none' | 'done' | 'pending' | 'unavailable'; acked: number; rejected: number; pending: number };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const report = (status: ImportReport['status'], manifest?: ImportManifest): ImportReport => {
  const receipts = manifest ? Object.values(manifest.receipts) : [];
  const acked = receipts.filter((r) => r.status === 'acked').length;
  const rejected = receipts.length - acked;
  return { status, acked, rejected, pending: manifest ? manifest.rows.length - receipts.length : 0 };
};

// ---- reading the legacy buckets (no seed, no store module) ----

/** Owner and menu are the storage-key tuple; the row and its id must agree with it. */
function rowMatches(row: unknown, actorId: string, menuId: string | null): row is Record<string, unknown> {
  if (!isObject(row) || typeof row['id'] !== 'string' || row['ownerId'] !== actorId) return false;
  const parts = row['id'].split('|');
  if (parts.length !== 3 || parts[0] !== actorId || (parts[1] === '' ? null : parts[1]) !== menuId) return false;
  const kind = row['kind'];
  if (kind !== 'condition-set' && kind !== 'menu-view') return false;
  return (kind === 'menu-view' ? row['menuId'] : null) === menuId;
}

/** The owner-visible content (pending proposal before the published copy) as exactly the strict wire draft fields. */
function project(content: Record<string, unknown>): unknown {
  const common = { schemaVersion: content['schemaVersion'], kind: content['kind'], name: content['name'], context: content['context'] };
  if (content['kind'] === 'condition-set') return common;
  return { ...common, menuId: content['menuId'], menuSchemaVersion: content['menuSchemaVersion'], page: content['page'], chartOptions: content['chartOptions'], layout: content['layout'], panels: content['panels'] };
}

/** The server refuses NUL and unpaired surrogates in `legacyKey`; a row carrying one stays in the browser and never joins a request, so it cannot invalidate its neighbours. */
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
const isWellFormedKey = (value: string): boolean => !value.includes('\u0000') && !LONE_SURROGATE.test(value);

function readBucket(storage: StoragePort, name: string, actorId: string): { menuId: string | null; rows: ManifestRow[] } | null {
  let parsedKey: unknown;
  try { parsedKey = JSON.parse(name.slice(ROWS_PREFIX.length)); } catch { return null; }
  if (!Array.isArray(parsedKey) || parsedKey.length !== 3 || parsedKey[0] !== 1 || parsedKey[1] !== actorId) return null;
  const menuId = parsedKey[2];
  if (menuId !== null && typeof menuId !== 'string') return null;
  if (name !== ROWS_PREFIX + tuple(actorId, menuId)) return null;
  let envelope: unknown;
  try { envelope = JSON.parse(storage.getItem(name) ?? 'null'); } catch { return null; }
  if (!isObject(envelope) || envelope['schemaVersion'] !== 1 || !Array.isArray(envelope['views'])) return null;
  const rows: ManifestRow[] = [];
  for (const row of envelope['views'] as unknown[]) {
    if (!rowMatches(row, actorId, menuId)) continue;
    const pending = row['pending'];
    if (pending !== undefined && !(rowMatches(pending, actorId, menuId) && pending['id'] === row['id'])) continue;
    const draft = project(pending !== undefined ? (pending as Record<string, unknown>) : row);
    const legacyKey = row['id'] as string;
    if (legacyKey.length > 200 || !isWellFormedKey(legacyKey) || !isSavedViewDraft(draft)) continue;
    rows.push({ legacyKey, draft: draft as SavedViewDraft });
  }
  return { menuId, rows };
}

export function readLegacyRows(storage: StoragePort, actorId: string): { rows: ManifestRow[]; defaults: ManifestDefault[] } {
  const names: string[] = [];
  for (let i = 0; i < storage.length; i += 1) { const name = storage.key(i); if (name?.startsWith(ROWS_PREFIX)) names.push(name); }
  const rows = new Map<string, ManifestRow>();
  const defaults: ManifestDefault[] = [];
  for (const name of names.sort()) {
    const bucket = readBucket(storage, name, actorId);
    if (!bucket) continue;
    for (const row of bucket.rows) if (!rows.has(row.legacyKey)) rows.set(row.legacyKey, row);
    try {
      const stored: unknown = JSON.parse(storage.getItem(DEFAULT_PREFIX + tuple(actorId, bucket.menuId)) ?? 'null');
      if (isObject(stored) && stored['schemaVersion'] === 1 && typeof stored['id'] === 'string' && bucket.rows.some((row) => row.legacyKey === stored['id'])) defaults.push({ menuId: bucket.menuId, legacyKey: stored['id'] });
    } catch { /* an unreadable default is no default */ }
  }
  return { rows: [...rows.values()].sort((a, b) => (a.legacyKey < b.legacyKey ? -1 : 1)), defaults };
}

// ---- bounded, deterministic batches ----

const commandOf = (token: string, rows: readonly ManifestRow[], defaults: readonly ManifestDefault[]): SavedViewImportCommand => ({
  importToken: token,
  rows,
  defaults: defaults.map((d) => ({ key: { menuId: d.menuId }, legacyKey: d.legacyKey })),
});
const fits = (command: SavedViewImportCommand): boolean => {
  const body = { version: 1, op: 'importLocal', ...command };
  return command.rows.length <= IMPORT_ROWS_MAX && command.defaults.length <= IMPORT_ROWS_MAX && withinDepth(body) && jsonBytes(body) <= COMMAND_MAX_BYTES;
};

/** Greedy in `legacyKey` order; a row that does not fit alone must have been rejected by the caller's preflight. */
export function splitBatches(token: string, rows: readonly ManifestRow[], defaults: readonly ManifestDefault[]): { rows: ManifestRow[]; defaults: ManifestDefault[] }[] {
  const batches: { rows: ManifestRow[]; defaults: ManifestDefault[] }[] = [];
  let current: { rows: ManifestRow[]; defaults: ManifestDefault[] } = { rows: [], defaults: [] };
  for (const row of rows) {
    const own = defaults.filter((d) => d.legacyKey === row.legacyKey);
    const next = { rows: [...current.rows, row], defaults: [...current.defaults, ...own] };
    if (current.rows.length > 0 && !fits(commandOf(token, next.rows, next.defaults))) {
      batches.push(current);
      current = { rows: [row], defaults: own };
    } else current = next;
  }
  if (current.rows.length > 0) batches.push(current);
  return batches;
}

// ---- manifest ----

function loadManifest(storage: StoragePort, actorId: string): ImportManifest | 'corrupt' | null {
  const raw = storage.getItem(importManifestKey(actorId));
  if (raw === null) return null;
  try {
    const m: unknown = JSON.parse(raw);
    if (isObject(m) && m['schemaVersion'] === 1 && m['actorId'] === actorId && typeof m['token'] === 'string' && m['token'] !== '' && Array.isArray(m['rows']) && Array.isArray(m['defaults']) && isObject(m['receipts'])) return m as unknown as ImportManifest;
  } catch { /* fall through */ }
  return 'corrupt';
}
const saveManifest = (storage: StoragePort & Pick<Storage, 'setItem'>, manifest: ImportManifest): boolean => {
  try { storage.setItem(importManifestKey(manifest.actorId), JSON.stringify(manifest)); return true; } catch { return false; }
};
const newToken = (): string => `imp-${Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')}`;

export type LocalImportDeps = {
  storage: StoragePort;
  locks: Locks | undefined;
  /** The current session actor (`core.actors.id`), read again after every await. */
  actorId: () => string;
  importLocal: ImportLocal;
  token?: () => string;
};

/** Each sent `legacyKey` answered exactly once and nothing else: otherwise the answer is not trusted and nothing is acknowledged. */
function verified(sent: readonly ManifestRow[], outcome: SavedViewImportOutcome): boolean {
  const answered = new Set(outcome.results.map((r) => r.legacyKey));
  return outcome.results.length === sent.length && answered.size === sent.length && sent.every((row) => answered.has(row.legacyKey));
}

export async function runLocalImport(deps: LocalImportDeps): Promise<ImportReport> {
  const { storage, locks, importLocal } = deps;
  const actorId = deps.actorId();
  if (!locks || actorId === '') return report('unavailable');
  const same = () => deps.actorId() === actorId;
  try {
    return await locks.request(SAVED_VIEWS_LOCK, async () => {
      if (!same()) return report('unavailable');
      let manifest: ImportManifest;
      const existing = loadManifest(storage, actorId);
      if (existing === 'corrupt') return report('unavailable');
      if (existing) manifest = existing;
      else {
        const source = readLegacyRows(storage, actorId);
        if (source.rows.length === 0) return report('none');
        manifest = { schemaVersion: 1, actorId, token: (deps.token ?? newToken)(), rows: source.rows, defaults: source.defaults, receipts: {} };
        // A row that cannot fit a request even alone is never sent or acknowledged; it stays in the browser.
        for (const row of manifest.rows) if (!fits(commandOf(manifest.token, [row], []))) manifest.receipts[row.legacyKey] = { status: 'rejected', reason: 'too-large' };
        if (!saveManifest(storage, manifest)) return report('unavailable');
      }
      const waiting = () => manifest.rows.filter((row) => manifest.receipts[row.legacyKey] === undefined);
      for (const batch of splitBatches(manifest.token, waiting(), manifest.defaults)) {
        if (!same()) return report('unavailable', manifest);
        const result = await importLocal(commandOf(manifest.token, batch.rows, batch.defaults));
        if (result.ok && !verified(batch.rows, result.value)) break;
        if (!result.ok) {
          // The whole body was refused (422): non-importable for this manifest. Anything else may succeed later.
          if (result.reason !== 'invalid') break;
          for (const row of batch.rows) manifest.receipts[row.legacyKey] = { status: 'rejected', reason: 'batch-invalid' };
        } else {
          for (const outcome of result.value.results) {
            if (outcome.status === 'rejected') { if (outcome.reason === 'invalid') manifest.receipts[outcome.legacyKey] = { status: 'rejected', reason: 'invalid' }; }
            else manifest.receipts[outcome.legacyKey] = { status: 'acked', id: outcome.id };
          }
        }
        if (!saveManifest(storage, manifest)) return report('unavailable', manifest);
      }
      return report(waiting().length === 0 ? 'done' : 'pending', manifest);
    });
  } catch {
    return report('unavailable');
  }
}

/** Lists and the default wait (bounded) for the one import of this assembly, so imported views are visible; they never fail because of it. */
export function afterImport(store: SavedViewStore, imported: Promise<unknown>, boundMs = 30_000): SavedViewStore {
  const settled = new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, boundMs);
    const done = () => { clearTimeout(timer); resolve(); };
    imported.then(done, done);
  });
  return {
    ...store,
    list: async (key) => { await settled; return store.list(key); },
    getDefaultId: async (key) => { await settled; return store.getDefaultId(key); },
  };
}
