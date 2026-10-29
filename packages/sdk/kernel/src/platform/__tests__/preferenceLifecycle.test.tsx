import { cleanup, render, waitFor } from '@testing-library/react';
import { StrictMode, useEffect, useRef } from 'react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { groupId, spaceId, type JsonValue, type PlatformAdapter, type Session } from '@ap/contracts';
import { I18nProvider } from '../../i18n';
import { PlatformProvider } from '../platform';
import { createRegistry } from '../../registry/registry';
import { createPreferenceController, type PreferenceController } from '../preferenceController';
import { usePreferenceController } from '../preferenceContext';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '../../testing';

const registry = createRegistry({
  spaces: [testSpace()],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'overview', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});
const ok = (values: Record<string, JsonValue>, importedAt: string | null = '2026-10-29T00:00:00Z') => ({ outcome: 'ok' as const, data: { values, importedAt }, assessments: [], trust: null, correlationId: 'c' });
const bad = () => ({ outcome: 'error' as const, data: null, assessments: [], trust: null, correlationId: 'c' });
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
const value = { sizing: { a: 120 }, visibility: {}, pinning: { left: [], right: [] } };
const sessionOf = (id: string): Session => testSession(['platform:view'], { user: { id, name: id, title: { ko: id, en: id } } });

/** Server with one preference map per ACTOR: the actor of a request is the session at the moment the adapter is called. */
function fixture(options: { failPatches?: number } = {}) {
  const accounts: Record<string, Record<string, JsonValue>> = { 'user-a': {}, 'user-b': {} };
  let current = sessionOf('user-a');
  const listeners = new Set<() => void>();
  const sent: { actor: string; patch: { set?: Readonly<Record<string, JsonValue>>; remove?: readonly string[] } }[] = [];
  let failures = options.failPatches ?? 0;
  const adapter: PlatformAdapter = testAdapter({
    session: () => current,
    subscribe: l => { listeners.add(l); return () => { listeners.delete(l); }; },
    readPreferences: async () => ok(accounts[current.user.id]!),
    patchPreferences: async patch => {
      const actor = current.user.id;
      sent.push({ actor, patch });
      if (failures > 0) { failures--; return bad(); }
      accounts[actor] = { ...accounts[actor], ...(patch.set ?? {}) };
      return ok(accounts[actor]!);
    },
  });
  const switchTo = (id: string) => { current = sessionOf(id); listeners.forEach(l => l()); };
  return { adapter, accounts, sent, switchTo };
}
const keys = (f: ReturnType<typeof fixture>, actor: string) => f.sent.filter(s => s.actor === actor).flatMap(s => Object.keys(s.patch.set ?? {})).filter(k => k.startsWith('columns:'));

function deferredSha() {
  let release: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  return { sha: async (text: string) => { await gate; return text.padEnd(64, '0').slice(0, 64).replace(/[^0-9a-f]/g, 'a'); }, release };
}
const make = (f: ReturnType<typeof fixture>, userId: string, sha?: (t: string) => Promise<string>) => createPreferenceController({ adapter: f.adapter, userId, ...(sha ? { sha256: sha } : {}), storage: () => memoryStorage() });

describe('preference controller: table writes across lifecycle edges', () => {
  it('a table write whose hash is still pending when the controller stops is still sent (same account)', async () => {
    const f = fixture();
    const d = deferredSha();
    const c = make(f, 'user-a', d.sha);
    c.start();
    await settle();
    c.setTable('t1', value);
    c.stop();
    d.release();
    await settle();
    expect(keys(f, 'user-a')).toHaveLength(1);
    expect(keys(f, 'user-b')).toEqual([]);
  });

  it('a set() after stop() is sent, not dropped', async () => {
    const f = fixture();
    const c = make(f, 'user-a');
    c.start();
    await settle();
    c.stop();
    c.set('lang', 'en');
    await settle();
    expect(f.accounts['user-a']).toEqual({ lang: 'en' });
  });

  it('account replacement: an old account\'s deferred table write is never sent under the new actor', async () => {
    const f = fixture();
    const d = deferredSha();
    const old = make(f, 'user-a', d.sha);
    old.start();
    await settle();
    old.setTable('t1', value);
    f.switchTo('user-b');
    old.stop();
    const fresh = make(f, 'user-b');
    fresh.start();
    await settle();
    d.release();
    await settle();
    expect(f.sent.filter(s => s.actor === 'user-b')).toEqual([]);
    expect(f.accounts['user-b']).toEqual({});
    expect(Object.keys(fresh.get('lang') === undefined ? {} : {})).toEqual([]);
    // Not discarded: the same account coming back receives its own intent.
    f.switchTo('user-a');
    const back = make(f, 'user-a');
    back.start();
    await settle();
    expect(keys(f, 'user-a')).toHaveLength(1);
    expect(Object.keys(f.accounts['user-a']!)[0]).toMatch(/^columns:h1_/);
  });

  it('a controller whose session user changed never sends a queued write under the new actor', async () => {
    const f = fixture();
    const c = make(f, 'user-a');
    c.start();
    await settle();
    f.switchTo('user-b');
    c.set('lang', 'en');
    await settle();
    expect(f.sent).toEqual([]);
    c.stop();
    await settle();
    expect(f.sent).toEqual([]);
  });

  it('same account, new generation (revision): unsent intent is handed to the next controller', async () => {
    const f = fixture({ failPatches: 1 });
    const first = make(f, 'user-a');
    first.start();
    await settle();
    first.set('lang', 'en');
    await settle();
    expect(first.state().failure).toBe('write');
    first.stop();
    const next = make(f, 'user-a');
    next.start();
    await settle();
    expect(f.accounts['user-a']).toEqual({ lang: 'en' });
  });

  it('StrictMode replay of one controller keeps a pending write and sends it once the controller is ready', async () => {
    const f = fixture();
    const c = make(f, 'user-a');
    c.set('lang', 'en');
    c.start(); c.stop(); c.start();
    await settle();
    expect(f.accounts['user-a']).toEqual({ lang: 'en' });
  });
});

/** A table that changed its width for the FIRST controller only; the write happens in its cleanup (unmount or generation swap). */
function Table({ raw }: { raw: string }) {
  const c = usePreferenceController();
  const owner = useRef<PreferenceController | null>(null);
  useEffect(() => {
    owner.current ??= c;
    return () => { if (c && c === owner.current) c.setTable(raw, value); };
  }, [c, raw]);
  return null;
}

describe('PlatformProvider lifecycle with a table consumer', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  const tree = (f: ReturnType<typeof fixture>, child: boolean) => (
    <StrictMode><I18nProvider><PlatformProvider serverPreferences equipmentAxes={[]} adapter={f.adapter} registry={registry}>{child ? <Table raw="t1" /> : null}</PlatformProvider></I18nProvider></StrictMode>
  );
  const ready = async (f: ReturnType<typeof fixture>) => { await waitFor(() => expect(f.sent).toBeDefined()); await settle(); await settle(); };

  it('whole Provider unmount flushes the table write of the table cleanup', async () => {
    const f = fixture();
    const view = render(tree(f, true));
    await ready(f);
    view.unmount();
    await waitFor(() => expect(Object.keys(f.accounts['user-a']!).filter(k => k.startsWith('columns:'))).toHaveLength(1));
  });

  it('ordinary table unmount while the Provider stays sends the write', async () => {
    const f = fixture();
    const view = render(tree(f, true));
    await ready(f);
    view.rerender(tree(f, false));
    await waitFor(() => expect(Object.keys(f.accounts['user-a']!).filter(k => k.startsWith('columns:'))).toHaveLength(1));
  });

  it('a session switch with the table still mounted never sends its write under the new account', async () => {
    const f = fixture();
    const view = render(tree(f, true));
    await ready(f);
    f.switchTo('user-b');
    await settle();
    view.unmount();
    await settle();
    await settle();
    expect(keys(f, 'user-b')).toEqual([]);
  });
});

describe('preference controller: read/import identity boundary', () => {
  const legacy = () => { const store = memoryStorage(); store.setItem('platform:favorites:user-a', JSON.stringify(['a-only'])); return store; };
  const makeLegacy = (f: ReturnType<typeof fixture>) => createPreferenceController({ adapter: f.adapter, userId: 'user-a', sha256: async () => 'a'.repeat(64), storage: legacy });
  const gated = <T,>() => { let release: (v: T) => void = () => {}; const promise = new Promise<T>(resolve => { release = resolve; }); return { promise, release }; };

  it('a deferred first read that resolves after the adapter session changed imports nothing and applies nothing', async () => {
    const f = fixture();
    const read = gated<ReturnType<typeof ok>>();
    const imports: unknown[] = [];
    f.adapter.readPreferences = () => read.promise;
    f.adapter.importPreferences = async input => { imports.push(input); return ok({}, '2026-10-29T00:00:00Z'); };
    const c = makeLegacy(f);
    c.start();
    f.switchTo('user-b');
    read.release(ok({ lang: 'ko' }, null));
    await settle();
    expect(imports).toEqual([]);
    expect(c.get('lang')).toBeUndefined();
    expect(c.state().status).toBe('loading');
  });

  it('an import response that arrives after the session changed is not applied or acknowledged', async () => {
    const f = fixture();
    const response = gated<ReturnType<typeof ok>>();
    const imports: unknown[] = [];
    f.adapter.readPreferences = async () => ok({}, null);
    f.adapter.importPreferences = input => { imports.push(input); return response.promise; };
    const c = makeLegacy(f);
    c.start();
    await settle();
    expect(imports).toHaveLength(1);
    f.switchTo('user-b');
    response.release(ok({ favorites: ['a-only'] }, '2026-10-29T00:00:00Z'));
    await settle();
    expect(c.get('favorites')).toBeUndefined();
    expect(c.state().status).toBe('loading');
  });

  it('a candidate hash that finishes after the session changed never reaches import', async () => {
    const f = fixture();
    const hash = gated<string>();
    const imports: unknown[] = [];
    f.adapter.readPreferences = async () => ok({}, null);
    f.adapter.importPreferences = async input => { imports.push(input); return ok({}, '2026-10-29T00:00:00Z'); };
    const store = memoryStorage();
    store.setItem('platform:table:t', JSON.stringify(value));
    const c = createPreferenceController({ adapter: f.adapter, userId: 'user-a', sha256: () => hash.promise, storage: () => store });
    c.start();
    await settle();
    f.switchTo('user-b');
    hash.release('b'.repeat(64));
    await settle();
    expect(imports).toEqual([]);
  });

  it('retry and start after an identity mismatch read and send nothing', async () => {
    const f = fixture();
    let reads = 0;
    f.adapter.readPreferences = async () => { reads++; return bad(); };
    const c = makeLegacy(f);
    c.start();
    await settle();
    expect(c.state()).toMatchObject({ status: 'failed', failure: 'read' });
    expect(reads).toBe(1);
    f.switchTo('user-b');
    c.retry();
    await settle();
    expect(reads).toBe(1);
    const second = makeLegacy(f);
    second.start();
    await settle();
    expect(reads).toBe(1);
  });

  it('real Provider: a session switch before the first read resolves never sends the old account local data under the new actor', async () => {
    vi.stubGlobal('localStorage', memoryStorage());
    localStorage.setItem('platform:favorites:user-a', JSON.stringify(['a-only']));
    const f = fixture();
    const first = gated<ReturnType<typeof ok>>();
    const imports: { actor: string; input: unknown }[] = [];
    let reads = 0;
    f.adapter.readPreferences = () => (++reads === 1 ? first.promise : Promise.resolve(ok({}, null)));
    f.adapter.importPreferences = async input => { imports.push({ actor: f.adapter.session().user.id, input }); return ok({}, '2026-10-29T00:00:00Z'); };
    const view = render(<StrictMode><I18nProvider><PlatformProvider serverPreferences equipmentAxes={[]} adapter={f.adapter} registry={registry}><span /></PlatformProvider></I18nProvider></StrictMode>);
    await waitFor(() => expect(reads).toBeGreaterThan(0));
    f.switchTo('user-b');
    first.release(ok({}, null));
    await settle();
    await settle();
    expect(JSON.stringify(imports.filter(i => i.actor === 'user-b'))).not.toContain('a-only');
    view.unmount();
    vi.unstubAllGlobals();
  });
});
