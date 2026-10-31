import { describe, expect, it, vi } from 'vitest';
import type { JsonValue, PreferencesSnapshot } from '@ap/contracts';
import { memoryStorage, testAdapter, testSession } from '../../testing';
import { createPreferenceController, importFits } from '../preferenceController';
import { collectLegacyPreferences, strictTablePreferences } from '../preferenceLegacy';

const fakeSha = async (text: string) => Array.from(text).reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 1_000_000_007, 7).toString(16).padStart(64, '0');
const ok = (data: PreferencesSnapshot) => ({ outcome: 'ok' as const, data, assessments: [], trust: null, correlationId: 'c' });
const bad = () => ({ outcome: 'error' as const, data: null, assessments: [], trust: null, correlationId: 'c' });
const flushAll = () => new Promise(resolve => setTimeout(resolve, 0));

function fixture(options: { server?: Record<string, JsonValue>; importedAt?: string | null; store?: Storage } = {}) {
  let values = { ...(options.server ?? {}) };
  let importedAt = options.importedAt ?? null;
  const calls: string[] = [];
  const imports: Record<string, JsonValue>[] = [];
  const patches: unknown[] = [];
  const gate = { read: null as null | Promise<void> };
  const adapter = testAdapter({
    readPreferences: async () => { calls.push('read'); if (gate.read) await gate.read; return ok({ values, importedAt }); },
    patchPreferences: async patch => { calls.push('patch'); patches.push(patch); for (const k of patch.remove ?? []) delete values[k]; values = { ...values, ...(patch.set ?? {}) }; return ok({ values, importedAt }); },
    importPreferences: async input => { calls.push('import'); imports.push(input.values); if (importedAt === null) { values = { ...input.values, ...values }; importedAt = '2026-10-29T00:00:00Z'; } return ok({ values, importedAt }); },
  });
  const store = options.store ?? memoryStorage();
  return { adapter, store, calls, imports, patches, gate, server: () => values };
}
// The adapter session is the authority for the acting account: a controller made for `userId` needs a session of that user.
const sessionOf = (id: string) => testSession(['platform:view'], { user: { id, name: id, title: { ko: id, en: id } } });
const make = (f: ReturnType<typeof fixture>, userId = 'u1') => {
  f.adapter.session = () => sessionOf(userId);
  return createPreferenceController({ adapter: f.adapter, userId, sha256: fakeSha, storage: () => f.store });
};

describe('preference controller lifecycle', () => {
  it('reads first, imports only when importedAt is null, then becomes ready', async () => {
    const f = fixture();
    f.store.setItem('platform:favorites:u1', JSON.stringify(['m1']));
    const c = make(f);
    c.start();
    expect(c.state().status).toBe('loading');
    await flushAll();
    expect(f.calls).toEqual(['read', 'import']);
    expect(f.imports[0]).toEqual({ favorites: ['m1'] });
    expect(c.state().status).toBe('ready');
    expect(c.get('favorites')).toEqual(['m1']);
    // The originals stay: the snapshot ACK cannot say which device committed.
    expect(f.store.getItem('platform:favorites:u1')).toBe(JSON.stringify(['m1']));
  });

  it('never re-imports once importedAt is set (deleted server keys do not come back)', async () => {
    const f = fixture({ importedAt: '2026-10-01T00:00:00Z', server: {} });
    f.store.setItem('platform:favorites:u1', JSON.stringify(['old']));
    const c = make(f);
    c.start();
    await flushAll();
    expect(f.calls).toEqual(['read']);
    expect(c.get('favorites')).toBeUndefined();
  });

  it('server values win on import and an empty import still commits the ACK', async () => {
    const f = fixture({ server: { favorites: ['server'] } });
    f.store.setItem('platform:favorites:u1', JSON.stringify(['local']));
    const c = make(f);
    c.start();
    await flushAll();
    expect(f.imports[0]).toEqual({});
    expect(c.get('favorites')).toEqual(['server']);
    expect(c.state().status).toBe('ready');
  });

  it('keeps all local data and assumes nothing when the first read fails', async () => {
    const f = fixture();
    f.adapter.readPreferences = async () => bad();
    f.store.setItem('platform:favorites:u1', JSON.stringify(['m1']));
    const c = make(f);
    c.start();
    await flushAll();
    expect(c.state()).toMatchObject({ status: 'failed', failure: 'read' });
    expect(f.imports).toEqual([]);
    expect(f.store.getItem('platform:favorites:u1')).not.toBeNull();
  });

  it('a throwing or malformed import response is a failure, not an ACK', async () => {
    const f = fixture();
    f.adapter.importPreferences = async () => { throw new Error('down'); };
    const c = make(f);
    c.start();
    await flushAll();
    expect(c.state()).toMatchObject({ status: 'failed', failure: 'import' });
    f.adapter.importPreferences = async () => ok({ values: {}, importedAt: null });
    c.retry();
    await flushAll();
    expect(c.state()).toMatchObject({ status: 'failed', failure: 'import' });
  });

  it('writes made while the read is in flight survive and flush after ready, named keys only', async () => {
    const f = fixture({ importedAt: '2026-10-01T00:00:00Z', server: { lang: 'en', favorites: ['a'] } });
    let release!: () => void;
    f.gate.read = new Promise(r => { release = r; });
    const c = make(f);
    c.start();
    c.set('lastScope', 's1');
    c.remove('favorites');
    expect(c.get('lastScope')).toBe('s1');
    expect(f.patches).toEqual([]);
    release();
    await flushAll();
    expect(f.patches).toEqual([{ set: { lastScope: 's1' }, remove: ['favorites'] }]);
    expect(c.get('lang')).toBe('en');
    expect(c.get('favorites')).toBeUndefined();
  });

  it('a newer local edit is not overwritten by an older patch response', async () => {
    const f = fixture({ importedAt: '2026-10-29T00:00:00Z', server: {} });
    const c = make(f);
    c.start();
    await flushAll();
    let release!: () => void;
    const hold = new Promise<void>(r => { release = r; });
    const inner = f.adapter.patchPreferences;
    f.adapter.patchPreferences = async (p, s) => { await hold; return inner(p, s); };
    c.set('lastScope', 'one');
    await flushAll();
    c.set('lastScope', 'two');
    release();
    await flushAll();
    await flushAll();
    expect(c.get('lastScope')).toBe('two');
    expect(f.server().lastScope).toBe('two');
  });

  it('a failed patch keeps the intent for a retry and reports a recoverable write failure', async () => {
    const f = fixture({ importedAt: '2026-10-29T00:00:00Z', server: {} });
    const c = make(f);
    c.start();
    await flushAll();
    const inner = f.adapter.patchPreferences;
    f.adapter.patchPreferences = async () => bad();
    c.set('lang', 'en');
    await flushAll();
    expect(c.state()).toMatchObject({ status: 'ready', failure: 'write' });
    expect(c.get('lang')).toBe('en');
    f.adapter.patchPreferences = inner;
    c.retry();
    await flushAll();
    expect(f.server().lang).toBe('en');
    expect(c.state().failure).toBeNull();
  });

  it('stop() invalidates the generation: a late read or patch is ignored', async () => {
    const f = fixture({ importedAt: '2026-10-29T00:00:00Z', server: { lang: 'en' } });
    let release!: () => void;
    f.gate.read = new Promise(r => { release = r; });
    const c = make(f);
    c.start();
    c.stop();
    release();
    await flushAll();
    expect(c.get('lang')).toBeUndefined();
    expect(c.state().status).toBe('loading');
  });

  it('StrictMode replay (start, stop, start) reads again and ends ready once', async () => {
    const f = fixture({ importedAt: '2026-10-29T00:00:00Z', server: { lang: 'ko' } });
    const c = make(f);
    c.start(); c.stop(); c.start();
    await flushAll();
    expect(c.state().status).toBe('ready');
    expect(c.get('lang')).toBe('ko');
  });

  it('fires no timers and no writes by itself', async () => {
    vi.useFakeTimers();
    try {
      const f = fixture({ importedAt: '2026-10-29T00:00:00Z', server: {} });
      const c = make(f);
      c.start();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(f.patches).toEqual([]);
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it('two devices: the other device wins the import and this device keeps its originals', async () => {
    const f = fixture({ importedAt: '2026-10-29T00:00:00Z', server: { favorites: ['from-device-b'] } });
    f.store.setItem('platform:favorites:u1', JSON.stringify(['from-device-a']));
    const c = make(f);
    c.start();
    await flushAll();
    expect(f.imports).toEqual([]);
    expect(c.get('favorites')).toEqual(['from-device-b']);
    expect(f.store.getItem('platform:favorites:u1')).toBe(JSON.stringify(['from-device-a']));
  });

  it('switching users after an interrupted import never imports the old user suffixed keys', async () => {
    const f = fixture();
    f.store.setItem('platform:favorites:u1', JSON.stringify(['u1-fav']));
    f.store.setItem('platform:favorites:u2', JSON.stringify(['u2-fav']));
    f.store.setItem('platform:lang', 'en');
    const first = make(f, 'u1');
    first.start();
    first.stop();
    const second = make(f, 'u2');
    second.start();
    await flushAll();
    expect(f.imports.at(-1)).toEqual({ favorites: ['u2-fav'], lang: 'en' });
    expect(f.store.getItem('platform:favorites:u1')).toBe(JSON.stringify(['u1-fav']));
    expect(f.store.getItem('platform:lang')).toBe('en');
  });
});

describe('table keys', () => {
  it('derives a versioned full-SHA key that keeps colons, Unicode and long ids distinct', async () => {
    const c = make(fixture());
    const keys = await Promise.all(['a:b', 'a_b', '표:한글', 'x'.repeat(500)].map(k => c.tableKey(k)));
    for (const key of keys) expect(key).toMatch(/^columns:h1_[0-9a-f]{64}$/);
    expect(new Set(keys).size).toBe(4);
  });

  it('reports a recoverable failure without hashing when WebCrypto is unavailable and holds the import', async () => {
    const f = fixture();
    f.store.setItem('platform:table:metric-catalog', JSON.stringify({ sizing: {}, visibility: {}, pinning: { left: [], right: [] } }));
    const c = createPreferenceController({ adapter: f.adapter, userId: 'u1', sha256: async () => { throw new Error('no crypto'); }, storage: () => f.store });
    c.start();
    await flushAll();
    expect(c.state()).toMatchObject({ status: 'failed', failure: 'import_unavailable' });
    expect(f.imports).toEqual([]);
    expect(f.store.getItem('platform:table:metric-catalog')).not.toBeNull();
  });

  it('setTable stores under the hashed key', async () => {
    const f = fixture({ importedAt: '2026-10-29T00:00:00Z' });
    const c = make(f);
    c.start();
    await flushAll();
    c.setTable('platform:table:metric-catalog', { sizing: { a: 100 } });
    await flushAll();
    const key = await c.tableKey('platform:table:metric-catalog');
    expect(f.server()[key as string]).toEqual({ sizing: { a: 100 } });
  });
});

describe('legacy candidates', () => {
  const table = { sizing: { a: 100 }, visibility: { b: false }, pinning: { left: ['a', '_action'], right: ['_action'] } };
  it('takes only the exact current-user keys, raw lang and namespaced strict tables', async () => {
    const s = memoryStorage();
    s.setItem('platform:favorites:u1', JSON.stringify(['m']));
    s.setItem('platform:recent:u1', JSON.stringify([{ menuId: 'm', url: '/x', at: 1 }, { menuId: 'm', url: 'https://evil', at: 2 }]));
    s.setItem('platform:lastScope:u1', JSON.stringify('s'));
    s.setItem('platform:favorites:u2', JSON.stringify(['other']));
    s.setItem('platform:lang', 'en');
    s.setItem('platform:table:metric-catalog', JSON.stringify(table));
    s.setItem('platform:table:bad', JSON.stringify({ sizing: {}, visibility: {}, pinning: { left: [], right: [] }, extra: 1 }));
    s.setItem('equipment-master:columns:v1', JSON.stringify(table));
    s.setItem('hw-time-table:columns:v1:L1', JSON.stringify(table));
    const out = await collectLegacyPreferences(s, 'u1', async raw => `columns:h1_${raw.length}`);
    expect(out.failed).toBe(false);
    expect(out.values).toEqual({
      favorites: ['m'], recents: [{ menuId: 'm', url: '/x', at: 1 }], lastScope: 's', lang: 'en',
      'columns:h1_29': { sizing: { a: 100 }, visibility: { b: false }, pinning: { left: ['a'], right: [] } },
    });
  });

  it('first import carries a new four-field table object (with order) and an old three-field one (#556a)', async () => {
    const s = memoryStorage();
    s.setItem('platform:table:new', JSON.stringify({ ...table, order: ['b', 'a'] }));
    s.setItem('platform:table:old', JSON.stringify(table));
    const out = await collectLegacyPreferences(s, 'u1', async raw => `columns:${raw}`);
    expect(out.values['columns:platform:table:new']).toEqual({ sizing: { a: 100 }, visibility: { b: false }, pinning: { left: ['a'], right: [] }, order: ['b', 'a'] });
    expect(out.values['columns:platform:table:old']).toEqual({ sizing: { a: 100 }, visibility: { b: false }, pinning: { left: ['a'], right: [] } });
  });

  it.each([
    ['non-array order', { ...table, order: 'a' }], ['non-string order id', { ...table, order: ['a', 1] }], ['unrelated extra field next to order', { ...table, order: [], extra: 1 }],
  ])('rejects a table object with %s', (_, value) => { expect(strictTablePreferences(value)).toBeNull(); });

  it('preserves corrupt records: unparseable or wrong-typed values are skipped', async () => {
    const s = memoryStorage();
    s.setItem('platform:favorites:u1', '{not json');
    s.setItem('platform:lastScope:u1', '7');
    s.setItem('platform:lang', 'fr');
    const out = await collectLegacyPreferences(s, 'u1', async () => null);
    expect(out).toEqual({ values: {}, failed: false });
    expect(s.getItem('platform:favorites:u1')).toBe('{not json');
  });

  it.each([
    ['array', []], ['missing pinning', { sizing: {}, visibility: {} }], ['string width', { sizing: { a: '1' }, visibility: {}, pinning: { left: [], right: [] } }],
    ['non-boolean visibility', { sizing: {}, visibility: { a: 1 }, pinning: { left: [], right: [] } }], ['non-string pin', { sizing: {}, visibility: {}, pinning: { left: [1], right: [] } }],
  ])('rejects a non-table shape: %s', (_, value) => { expect(strictTablePreferences(value)).toBeNull(); });
});

describe('import limits', () => {
  const server = (n: number) => Array.from({ length: n }, (_, i) => `columns:s${i}`);
  const many = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`columns:c${i}`, 1 as JsonValue]));
  it('accepts exactly 200 keys and rejects 201, counting server keys', () => {
    expect(importFits([], many(200))).toBe(true);
    expect(importFits([], many(201))).toBe(false);
    expect(importFits(server(199), many(1))).toBe(true);
    expect(importFits(server(199), many(2))).toBe(false);
  });
  it('rejects an oversized value and an oversized aggregate body, accepts the boundary', () => {
    const exact = 'x'.repeat(65_536 - 2);
    expect(importFits([], { columns: exact })).toBe(true);
    expect(importFits([], { columns: exact + 'x' })).toBe(false);
    const part = 'y'.repeat(60_000);
    expect(importFits([], Object.fromEntries([0, 1, 2, 3].map(i => [`columns:p${i}`, part])))).toBe(true);
    expect(importFits([], Object.fromEntries([0, 1, 2, 3, 4].map(i => [`columns:p${i}`, part])))).toBe(false);
  });
  it('rejects values deeper than 32', () => {
    let deep: JsonValue = 1;
    for (let i = 0; i < 33; i++) deep = [deep];
    expect(importFits([], { columns: deep })).toBe(false);
  });
  it('does not send, ack or erase when the candidates do not fit', async () => {
    const f = fixture({ server: Object.fromEntries(server(199).map(k => [k, 1])) });
    f.store.setItem('platform:favorites:u1', JSON.stringify(['m']));
    f.store.setItem('platform:lastScope:u1', JSON.stringify('s'));
    const c = make(f);
    c.start();
    await flushAll();
    expect(c.state()).toMatchObject({ status: 'failed', failure: 'import_too_large' });
    expect(f.imports).toEqual([]);
    expect(f.store.getItem('platform:favorites:u1')).not.toBeNull();
  });
});
