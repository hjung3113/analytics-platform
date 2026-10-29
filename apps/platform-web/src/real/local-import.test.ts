import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ImportLocal, SavedViewImportCommand } from '@ap/http-adapter';
import { afterImport, importManifestKey, readLegacyRows, runLocalImport, SAVED_VIEWS_LOCK, splitBatches, type LocalImportDeps } from './local-import';

const ACTOR = '11111111-1111-4111-8111-111111111111';
const tuple = (...parts: (string | null)[]) => JSON.stringify([1, ...parts]);
const rowsKey = (owner: string, menu: string | null) => 'platform:saved-views:v1:' + tuple(owner, menu);
const defaultKey = (owner: string, menu: string | null) => 'platform:saved-view-default:v1:' + tuple(owner, menu);

function memory(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  return {
    data,
    get length() { return data.size; },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v); },
  };
}
/** A Web Locks stand-in shared by every "tab" of one test: requests run one at a time in order. */
function lockPort() {
  let tail: Promise<unknown> = Promise.resolve();
  return { request: <T,>(_name: string, cb: () => Promise<T>): Promise<T> => { const run = tail.then(cb); tail = run.catch(() => undefined); return run; } };
}

const view = (seq: number | string, over: Record<string, unknown> = {}, menu = 'home') => ({
  id: `${ACTOR}|${menu}|${seq}`, schemaVersion: 1, kind: 'menu-view', name: `뷰 ${seq}`, ownerId: ACTOR, version: 1, updatedAt: 1,
  visibility: { kind: 'groups', groupIds: ['g1'] }, approval: 'approved', menuId: menu, menuSchemaVersion: 1, context: { roomNames: ['A'] },
  page: [['k', 'v']], chartOptions: {}, layout: null, panels: null, ...over,
});
const bucket = (...views: unknown[]) => JSON.stringify({ schemaVersion: 1, views });
const seeded = () => memory({
  [rowsKey(ACTOR, 'home')]: bucket(view(1), view(2)),
  [defaultKey(ACTOR, 'home')]: JSON.stringify({ schemaVersion: 1, id: `${ACTOR}|home|2` }),
});
const acceptAll: ImportLocal = async (command) => ({
  ok: true,
  value: { results: command.rows.map((r) => ({ legacyKey: r.legacyKey, status: 'imported' as const, id: `srv-${r.legacyKey}` })), defaults: [] },
});
function deps(storage: ReturnType<typeof memory>, importLocal: ImportLocal, over: Partial<LocalImportDeps> = {}): LocalImportDeps {
  return { storage, locks: lockPort(), actorId: () => ACTOR, importLocal, token: () => 'tok-1', ...over };
}
const snapshot = (storage: ReturnType<typeof memory>) => [...storage.data].filter(([k]) => !k.startsWith('platform:saved-view-import:')).map(([k, v]) => `${k}=${v}`).join('\n');
afterEach(() => vi.useRealTimers());

describe('reading the legacy buckets (#1105)', () => {
  it('an absent bucket is zero rows and sends and writes nothing', async () => {
    const storage = memory();
    const send = vi.fn(acceptAll);
    expect(await runLocalImport(deps(storage, send))).toMatchObject({ status: 'none' });
    expect(send).not.toHaveBeenCalled();
    expect(storage.data.size).toBe(0);
  });

  it('takes only the exact current actor buckets and skips foreign, demo, future, corrupt and mismatched values', () => {
    const storage = memory({
      [rowsKey(ACTOR, 'home')]: bucket(view(1), view(2, { ownerId: 'someone' }), view(3, { id: `${ACTOR}|other|3` }), view(4, { kind: 'condition-set' }), { id: 5 }, view(5, { name: '' }), view(6, { pending: view(6, { ownerId: 'x' }) })),
      [rowsKey('mock-admin', 'home')]: bucket({ ...view(1), ownerId: 'mock-admin', id: 'mock-admin|home|1' }),
      [rowsKey(ACTOR, 'future')]: JSON.stringify({ schemaVersion: 2, views: [view(1, {}, 'future')] }),
      [rowsKey(ACTOR, 'bad')]: '{nope',
      [rowsKey(ACTOR, null)]: bucket({ id: `${ACTOR}||1`, schemaVersion: 1, kind: 'condition-set', name: '조건', ownerId: ACTOR, version: 1, updatedAt: 1, visibility: { kind: 'private' }, approval: 'none', context: {} }),
      ['platform:saved-views:v1:' + JSON.stringify([1, ACTOR + 'x', 'home'])]: bucket(view(9)),
      [defaultKey(ACTOR, 'home')]: JSON.stringify({ schemaVersion: 1, id: `${ACTOR}|home|1` }),
    });
    const read = readLegacyRows(storage, ACTOR);
    expect(read.rows.map((r) => r.legacyKey)).toEqual([`${ACTOR}|home|1`, `${ACTOR}||1`]);
    expect(read.defaults).toEqual([{ menuId: 'home', legacyKey: `${ACTOR}|home|1` }]);
  });

  it('projects the owner-visible content (pending before published) into the strict draft fields only, with no authority', () => {
    const storage = memory({ [rowsKey(ACTOR, 'home')]: bucket(view(1, { pending: view(1, { name: '제안', visibility: { kind: 'official' }, approval: 'pending' }) })) });
    const [row] = readLegacyRows(storage, ACTOR).rows;
    expect(Object.keys(row!.draft).sort()).toEqual(['chartOptions', 'context', 'kind', 'layout', 'menuId', 'menuSchemaVersion', 'name', 'page', 'panels', 'schemaVersion']);
    expect(row!.draft).toMatchObject({ name: '제안' });
  });

  it('keeps a malformed row out of the batch without rejecting the valid ones', async () => {
    const storage = memory({ [rowsKey(ACTOR, 'home')]: bucket(view(1), view(2, { chartOptions: { hoverRow: 1 } })) });
    const send = vi.fn(acceptAll);
    await runLocalImport(deps(storage, send));
    expect(send.mock.calls[0]![0].rows.map((r: { legacyKey: string }) => r.legacyKey)).toEqual([`${ACTOR}|home|1`]);
  });

  it('keeps a malformed-Unicode legacy id (NUL, unpaired surrogate) from invalidating or blocking its valid neighbours, and leaves every original byte untouched', async () => {
    const storage = memory({ [rowsKey(ACTOR, 'home')]: bucket(view(1), view('\u0000', { name: 'nul' }), view('\ud800x', { name: 'lone' }), view(2)) });
    const before = snapshot(storage);
    const send = vi.fn(acceptAll);
    const done = await runLocalImport(deps(storage, send));
    const sent = send.mock.calls.flatMap(([command]) => command.rows.map((r: { legacyKey: string }) => r.legacyKey));
    expect(sent).toEqual([`${ACTOR}|home|1`, `${ACTOR}|home|2`]);
    expect(done).toEqual({ status: 'done', acked: 2, rejected: 0, pending: 0 });
    expect(Object.keys(JSON.parse(storage.getItem(importManifestKey(ACTOR))!).receipts)).toEqual(sent);
    expect(snapshot(storage)).toBe(before);
  });
});

describe('the import protocol (#1105)', () => {
  it('sends own rows and the default under one persisted token, acknowledges per row and keeps every original byte-identical', async () => {
    const storage = seeded();
    const before = snapshot(storage);
    const send = vi.fn(acceptAll);
    const done = await runLocalImport(deps(storage, send));
    expect(done).toEqual({ status: 'done', acked: 2, rejected: 0, pending: 0 });
    const command: SavedViewImportCommand = send.mock.calls[0]![0];
    expect(command.importToken).toBe('tok-1');
    expect(command.defaults).toEqual([{ key: { menuId: 'home' }, legacyKey: `${ACTOR}|home|2` }]);
    expect(JSON.parse(storage.getItem(importManifestKey(ACTOR))!).token).toBe('tok-1');
    expect(snapshot(storage)).toBe(before);
  });

  it('retries a partial acknowledgement with the same token and only the rows still waiting, and ignores a changed source', async () => {
    const storage = seeded();
    const first: ImportLocal = async (c) => ({ ok: true, value: { defaults: [], results: c.rows.map((r, i) => (i === 0 ? { legacyKey: r.legacyKey, status: 'imported' as const, id: 's1' } : { legacyKey: r.legacyKey, status: 'rejected' as const, reason: 'unavailable' as const })) } });
    expect(await runLocalImport(deps(storage, first))).toMatchObject({ status: 'pending', acked: 1, pending: 1 });
    storage.data.set(rowsKey(ACTOR, 'home'), bucket(view(1, { name: '바뀜' }), view(2, { name: '바뀜' })));
    const changed = snapshot(storage);
    const send = vi.fn(acceptAll);
    expect(await runLocalImport(deps(storage, send, { token: () => 'tok-2' }))).toMatchObject({ status: 'done', acked: 2 });
    expect(send.mock.calls[0]![0].importToken).toBe('tok-1');
    expect(send.mock.calls[0]![0].rows.map((r: { legacyKey: string }) => r.legacyKey)).toEqual([`${ACTOR}|home|2`]);
    expect(send.mock.calls[0]![0].rows[0].draft.name).toBe('뷰 2');
    expect(snapshot(storage)).toBe(changed);
  });

  it('keeps rows pending after a network or unavailable failure and sends the same manifest next time', async () => {
    const storage = seeded();
    const down: ImportLocal = async () => ({ ok: false, reason: 'unavailable' });
    expect(await runLocalImport(deps(storage, down))).toMatchObject({ status: 'pending', acked: 0, pending: 2 });
    const send = vi.fn(acceptAll);
    expect(await runLocalImport(deps(storage, send))).toMatchObject({ status: 'done' });
    expect(send.mock.calls[0]![0].importToken).toBe('tok-1');
  });

  it('marks a whole-body 422 and a row-level invalid non-importable and never resends them automatically', async () => {
    const storage = seeded();
    const refused: ImportLocal = async () => ({ ok: false, reason: 'invalid', detail: 'malformed' });
    expect(await runLocalImport(deps(storage, refused))).toMatchObject({ status: 'done', rejected: 2 });
    const send = vi.fn(acceptAll);
    await runLocalImport(deps(storage, send));
    expect(send).not.toHaveBeenCalled();
    const rowLevel = seeded();
    const unicode: ImportLocal = async (c) => ({ ok: true, value: { defaults: [], results: c.rows.map((r) => ({ legacyKey: r.legacyKey, status: 'rejected' as const, reason: 'invalid' as const, detail: 'unicode' })) } });
    expect(await runLocalImport(deps(rowLevel, unicode))).toMatchObject({ rejected: 2 });
  });

  it.each([
    ['a missing answer', (c: SavedViewImportCommand) => c.rows.slice(1)],
    ['a duplicated answer', (c: SavedViewImportCommand) => [...c.rows, c.rows[0]!]],
    ['an unknown key', (c: SavedViewImportCommand) => [...c.rows.slice(1), { legacyKey: 'ghost' }]],
  ])('acknowledges nothing when the reply has %s', async (_name, answer) => {
    const storage = seeded();
    const odd: ImportLocal = async (c) => ({ ok: true, value: { defaults: [], results: answer(c).map((r) => ({ legacyKey: r.legacyKey, status: 'imported' as const, id: 's' })) } });
    expect(await runLocalImport(deps(storage, odd))).toMatchObject({ status: 'pending', acked: 0 });
  });

  it('splits by the 200-row, byte and depth bounds before any send, and rejects a row too large alone without sending it', async () => {
    const many = Array.from({ length: 450 }, (_, i) => view(i + 1));
    const storage = memory({ [rowsKey(ACTOR, 'home')]: bucket(...many, view(900, { panels: 'x'.repeat(270_000) })) });
    const send = vi.fn(acceptAll);
    const out = await runLocalImport(deps(storage, send));
    expect(out).toMatchObject({ status: 'done', acked: 450, rejected: 1 });
    const sizes = send.mock.calls.map((c) => c[0].rows.length);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(200);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(450);
    for (const [c] of send.mock.calls) expect(new TextEncoder().encode(JSON.stringify({ version: 1, op: 'importLocal', ...c })).length).toBeLessThanOrEqual(262_144);
    const tokens = new Set(send.mock.calls.map((c) => c[0].importToken));
    expect(tokens.size).toBe(1);
  });

  it('splits by bytes: rows that fit one by one but not together go out in several batches', () => {
    const rows = Array.from({ length: 4 }, (_, i) => ({ legacyKey: `k${i}`, draft: { schemaVersion: 1 as const, kind: 'condition-set' as const, name: 'n'.repeat(100_000), context: {} } }));
    const batches = splitBatches('t', rows, []);
    expect(batches.map((b) => b.rows.length)).toEqual([2, 2]);
  });

  it('does not upload when the session actor changed before the network call', async () => {
    const storage = seeded();
    let calls = 0;
    const send = vi.fn(acceptAll);
    await runLocalImport(deps(storage, send, { actorId: () => (calls++ < 2 ? ACTOR : 'u2') }));
    expect(send).not.toHaveBeenCalled();
    expect(snapshot(storage)).toBe(snapshot(seeded()));
  });

  it('stops after a reply when the actor changed during the call, keeping the receipt under the first actor', async () => {
    const storage = memory({ [rowsKey(ACTOR, 'home')]: bucket(...Array.from({ length: 450 }, (_, i) => view(i + 1))) });
    let actor = ACTOR;
    const send = vi.fn<ImportLocal>(async (c) => { const r = await acceptAll(c); actor = 'u2'; return r; });
    const out = await runLocalImport(deps(storage, send, { actorId: () => actor }));
    expect(send).toHaveBeenCalledTimes(1);
    expect(out.status).toBe('unavailable');
    expect(JSON.parse(storage.getItem(importManifestKey(ACTOR))!).receipts).not.toEqual({});
  });

  it('fails closed without Web Locks and with an unreadable manifest, preserving the source', async () => {
    const send = vi.fn(acceptAll);
    expect(await runLocalImport(deps(seeded(), send, { locks: undefined }))).toMatchObject({ status: 'unavailable' });
    const storage = seeded();
    storage.data.set(importManifestKey(ACTOR), '{broken');
    expect(await runLocalImport(deps(storage, send))).toMatchObject({ status: 'unavailable' });
    expect(storage.getItem(importManifestKey(ACTOR))).toBe('{broken');
    expect(send).not.toHaveBeenCalled();
  });

  it('does not send when the token cannot be persisted', async () => {
    const storage = seeded();
    storage.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); };
    const send = vi.fn(acceptAll);
    expect(await runLocalImport(deps(storage, send))).toMatchObject({ status: 'unavailable' });
    expect(send).not.toHaveBeenCalled();
  });

  it('two tabs importing at once share one lock and one manifest: a single token and every row sent once', async () => {
    const storage = seeded();
    const locks = lockPort();
    const send = vi.fn(acceptAll);
    const [a, b] = await Promise.all([
      runLocalImport(deps(storage, send, { locks, token: () => 'tab-a' })),
      runLocalImport(deps(storage, send, { locks, token: () => 'tab-b' })),
    ]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0].importToken).toBe('tab-a');
    expect([a.status, b.status]).toEqual(['done', 'done']);
  });

  it('a local-store mutation from another tab waits for the importer on the same lock and cannot change the manifest', async () => {
    const storage = seeded();
    const locks = lockPort();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const order: string[] = [];
    const slow: ImportLocal = async (c) => { order.push('send'); await gate; return acceptAll(c); };
    const importing = runLocalImport(deps(storage, slow, { locks }));
    await vi.waitFor(() => expect(order).toEqual(['send']));
    const writing = locks.request(SAVED_VIEWS_LOCK, async () => { order.push('write'); storage.data.set(rowsKey(ACTOR, 'home'), bucket(view(1, { name: '새 이름' }))); });
    await Promise.resolve();
    expect(order).toEqual(['send']);
    release();
    await Promise.all([importing, writing]);
    expect(order).toEqual(['send', 'write']);
    const manifest = JSON.parse(storage.getItem(importManifestKey(ACTOR))!);
    expect(manifest.rows.map((r: { draft: { name: string } }) => r.draft.name)).toEqual(['뷰 1', '뷰 2']);
    expect(JSON.parse(storage.getItem(rowsKey(ACTOR, 'home'))!).views[0].name).toBe('새 이름');
  });
});

describe('reads wait for the one import (#1105)', () => {
  const store = () => ({ list: vi.fn(async () => []), getDefaultId: vi.fn(async () => null), save: vi.fn() }) as never;

  it('holds list and getDefaultId until the import settled, even when it failed, and delegates the rest untouched', async () => {
    let fail: (e: unknown) => void = () => {};
    const imported = new Promise((_, reject) => { fail = reject; });
    const inner = store() as { list: ReturnType<typeof vi.fn>; getDefaultId: ReturnType<typeof vi.fn>; save: unknown };
    const wrapped = afterImport(inner as never, imported);
    const pending = wrapped.list({ userId: ACTOR, menuId: null });
    await Promise.resolve();
    expect(inner.list).not.toHaveBeenCalled();
    fail(new Error('x'));
    await pending;
    expect(inner.list).toHaveBeenCalledOnce();
    await wrapped.getDefaultId({ userId: ACTOR, menuId: null });
    expect(inner.getDefaultId).toHaveBeenCalledOnce();
    expect(wrapped.save).toBe(inner.save);
  });

  it('is bounded: a stuck import does not block the reads forever', async () => {
    vi.useFakeTimers();
    const inner = store() as { list: ReturnType<typeof vi.fn> };
    const wrapped = afterImport(inner as never, new Promise(() => undefined), 1000);
    const pending = wrapped.list({ userId: ACTOR, menuId: null });
    await vi.advanceTimersByTimeAsync(1000);
    await pending;
    expect(inner.list).toHaveBeenCalledOnce();
  });
});
