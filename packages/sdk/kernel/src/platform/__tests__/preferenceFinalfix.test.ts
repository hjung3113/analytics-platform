import { describe, expect, it } from 'vitest';
import type { JsonValue } from '@ap/contracts';
import { memoryStorage, testAdapter, testSession } from '../../testing';
import { createPreferenceController } from '../preferenceController';

// #1104b final-review fixes C4–C6 on the controller: complete response shapes, retryable hashing, bounded recovery.
const HEX = 'c'.repeat(64);
const goodSha = async () => HEX;
const wrap = (data: unknown) => ({ outcome: 'ok' as const, data: data as never, assessments: [], trust: null, correlationId: 'c' });
const ok = (values: Record<string, JsonValue>, importedAt: string | null = '2026-10-29T00:00:00Z') => wrap({ values, importedAt });
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
const tableValue = (w: number) => ({ sizing: { a: w }, visibility: {}, pinning: { left: [], right: [] } });
const KEY = `columns:h1_${HEX}`;

function build(options: { sha?: (t: string) => Promise<string>; importedAt?: string | null; store?: Storage } = {}) {
  let values: Record<string, JsonValue> = {};
  const counts = { read: 0, import: 0, patch: 0 };
  const patches: unknown[] = [];
  const adapter = testAdapter({
    readPreferences: async () => { counts.read++; return ok(values, options.importedAt === undefined ? '2026-10-29T00:00:00Z' : options.importedAt); },
    importPreferences: async input => { counts.import++; values = { ...input.values, ...values }; return ok(values, '2026-10-29T00:00:00Z'); },
    patchPreferences: async patch => { counts.patch++; patches.push(patch); values = { ...values, ...(patch.set ?? {}) }; return ok(values); },
  });
  adapter.session = () => testSession(['platform:view'], { user: { id: 'u1', name: 'u1', title: { ko: 'u1', en: 'u1' } } });
  const controller = () => createPreferenceController({ adapter, userId: 'u1', sha256: options.sha ?? goodSha, storage: () => options.store ?? memoryStorage() });
  return { adapter, counts, patches, server: () => values, controller };
}

describe('C4 complete response shape before any ACK', () => {
  it.each([
    ['missing importedAt', { values: {} }],
    ['undefined importedAt', { values: {}, importedAt: undefined }],
    ['numeric importedAt', { values: {}, importedAt: 5 }],
    ['empty importedAt', { values: {}, importedAt: '' }],
    ['offsetless importedAt', { values: {}, importedAt: '2026-10-29T00:00:00' }],
    ['garbage importedAt', { values: {}, importedAt: 'x' }],
    ['impossible date importedAt', { values: {}, importedAt: '2026-02-30T00:00:00Z' }],
    ['null values', { values: null, importedAt: '2026-10-29T00:00:00Z' }],
    ['array values', { values: [], importedAt: '2026-10-29T00:00:00Z' }],
    ['missing values', { importedAt: '2026-10-29T00:00:00Z' }],
    ['non-finite value', { values: { k: Number.NaN }, importedAt: '2026-10-29T00:00:00Z' }],
    ['undefined value', { values: { k: undefined }, importedAt: '2026-10-29T00:00:00Z' }],
    ['non-object data', 'oops'],
  ])('read: %s fails without becoming ready', async (_, data) => {
    const f = build();
    f.adapter.readPreferences = async () => wrap(data);
    const c = f.controller();
    c.start();
    await settle();
    expect(c.state()).toMatchObject({ status: 'failed', failure: 'read' });
    expect(f.counts.import).toBe(0);
  });

  it.each([
    ['missing importedAt', { values: {} }],
    ['null importedAt', { values: {}, importedAt: null }],
    ['offsetless importedAt', { values: {}, importedAt: '2026-10-29T00:00:00' }],
    ['garbage importedAt', { values: {}, importedAt: 'x' }],
    ['impossible date importedAt', { values: {}, importedAt: '2026-02-30T00:00:00Z' }],
    ['array values', { values: [], importedAt: '2026-10-29T00:00:00Z' }],
    ['null data', null],
  ])('import: %s is not an ACK', async (_, data) => {
    const f = build({ importedAt: null });
    f.adapter.importPreferences = async () => wrap(data);
    const c = f.controller();
    c.start();
    await settle();
    expect(c.state()).toMatchObject({ status: 'failed', failure: 'import' });
  });

  it.each([
    ['missing importedAt', { values: { lang: 'ko' } }],
    ['offsetless importedAt', { values: { lang: 'ko' }, importedAt: '2026-10-29T00:00:00' }],
    ['garbage importedAt', { values: { lang: 'ko' }, importedAt: 'x' }],
    ['impossible date importedAt', { values: { lang: 'ko' }, importedAt: '2026-02-30T00:00:00Z' }],
    ['null values', { values: null, importedAt: '2026-10-29T00:00:00Z' }],
    ['array values', { values: [], importedAt: '2026-10-29T00:00:00Z' }],
  ])('patch: %s keeps the intent and the server value', async (_, data) => {
    const f = build();
    const c = f.controller();
    c.start();
    await settle();
    const good = f.adapter.patchPreferences;
    f.adapter.patchPreferences = async () => wrap(data);
    c.set('lang', 'en');
    await settle();
    expect(c.state()).toMatchObject({ status: 'ready', failure: 'write' });
    expect(c.get('lang')).toBe('en');
    expect(f.server()).toEqual({});
    f.adapter.patchPreferences = good;
    c.retry();
    await settle();
    expect(f.server()).toEqual({ lang: 'en' });
    expect(c.state().failure).toBeNull();
  });
});

describe('C5 a failed hash is retryable and keeps the raw table intent', () => {
  for (const [name, bad] of [['rejection', () => Promise.reject(new Error('no crypto'))], ['invalid hex', () => Promise.resolve('xyz')]] as const) {
    it(`${name}: recovery then retry stores the original value`, async () => {
      let healthy = false;
      const f = build({ sha: t => (healthy ? goodSha() : bad()) });
      const c = f.controller();
      c.start();
      await settle();
      c.setTable('t1', tableValue(111));
      await settle();
      expect(c.state().failure).toBe('write');
      expect(f.counts.patch).toBe(0);
      healthy = true;
      c.retry();
      await settle();
      await settle();
      expect(f.server()[KEY]).toEqual(tableValue(111));
      expect(c.state().failure).toBeNull();
    });
  }

  it('a failed hash is not cached forever (tableKey recovers)', async () => {
    let healthy = false;
    const c = build({ sha: () => (healthy ? goodSha() : Promise.reject(new Error('x'))) }).controller();
    expect(await c.tableKey('t')).toBeNull();
    healthy = true;
    expect(await c.tableKey('t')).toBe(KEY);
  });

  it('stop and a same-account remount keep the intent and send it once hashing works', async () => {
    let healthy = false;
    const f = build({ sha: () => (healthy ? goodSha() : Promise.reject(new Error('x'))) });
    const first = f.controller();
    first.start();
    await settle();
    first.setTable('t1', tableValue(150));
    await settle();
    first.stop();
    healthy = true;
    const second = f.controller();
    second.start();
    await settle();
    await settle();
    expect(f.server()[KEY]).toEqual(tableValue(150));
  });

  it('a newer table edit wins over the older failed one', async () => {
    let healthy = false;
    const f = build({ sha: () => (healthy ? goodSha() : Promise.reject(new Error('x'))) });
    const c = f.controller();
    c.start();
    await settle();
    c.setTable('t1', tableValue(100));
    await settle();
    healthy = true;
    c.setTable('t1', tableValue(200));
    await settle();
    c.retry();
    await settle();
    await settle();
    expect(f.server()[KEY]).toEqual(tableValue(200));
    expect(f.patches).toEqual([{ set: { [KEY]: tableValue(200) } }]);
  });

  it('a failed hash during the legacy import holds it and retry imports the complete set', async () => {
    let healthy = false;
    const store = memoryStorage();
    store.setItem('platform:table:one', JSON.stringify(tableValue(100)));
    const f = build({ sha: () => (healthy ? goodSha() : Promise.reject(new Error('x'))), importedAt: null, store });
    const c = f.controller();
    c.start();
    await settle();
    expect(c.state()).toMatchObject({ status: 'failed', failure: 'import_unavailable' });
    expect(f.counts.import).toBe(0);
    healthy = true;
    c.retry();
    await settle();
    expect(f.counts.import).toBe(1);
    expect(c.state().status).toBe('ready');
    expect(store.getItem('platform:table:one')).not.toBeNull();
  });
});

describe('C6 recovery after a failed step', () => {
  it('a deliberate edit after a failed first read retries the read and then saves the edit', async () => {
    const f = build();
    const read = f.adapter.readPreferences;
    f.adapter.readPreferences = async () => { f.counts.read++; return wrap(null); };
    const c = f.controller();
    c.start();
    await settle();
    expect(c.state()).toMatchObject({ status: 'failed', failure: 'read' });
    f.adapter.readPreferences = read;
    c.set('lang', 'en');
    await settle();
    expect(c.state().status).toBe('ready');
    expect(f.server()).toEqual({ lang: 'en' });
  });

  it('a permanent import_too_large neither spins nor retries on an edit', async () => {
    const store = memoryStorage();
    store.setItem('platform:favorites:u1', JSON.stringify(['m']));
    const f = build({ importedAt: null, store });
    f.adapter.readPreferences = async () => { f.counts.read++; return ok(Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`columns:s${i}`, 1])), null); };
    const c = f.controller();
    c.start();
    await settle();
    expect(c.state()).toMatchObject({ status: 'failed', failure: 'import_too_large' });
    c.set('lang', 'en');
    await settle();
    await settle();
    expect(f.counts.read).toBe(1);
    expect(f.counts.import).toBe(0);
  });
});
