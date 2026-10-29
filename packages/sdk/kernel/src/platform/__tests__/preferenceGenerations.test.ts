import { describe, expect, it } from 'vitest';
import { type JsonValue, type PlatformAdapter, type Session } from '@ap/contracts';
import { createPreferenceController } from '../preferenceController';
import { memoryStorage, testAdapter, testSession } from '../../testing';

const ok = (values: Record<string, JsonValue>, importedAt: string | null = '2026-10-29T00:00:00Z') => ({ outcome: 'ok' as const, data: { values, importedAt }, assessments: [], trust: null, correlationId: 'c' });
const bad = () => ({ outcome: 'error' as const, data: null, assessments: [], trust: null, correlationId: 'c' });
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
const gated = <T,>() => { let release: (v: T) => void = () => {}; const promise = new Promise<T>(resolve => { release = resolve; }); return { promise, release }; };
const sessionOf = (id: string): Session => testSession(['platform:view'], { user: { id, name: id, title: { ko: id, en: id } } });
const oldValue = { sizing: { a: 100 }, visibility: {}, pinning: { left: [], right: [] } };
const newValue = { sizing: { a: 200 }, visibility: {}, pinning: { left: [], right: [] } };
const HEX = 'b'.repeat(64);
const KEY = `columns:h1_${HEX}`;
const instantSha = async () => HEX;

type Patch = { set?: Readonly<Record<string, JsonValue>>; remove?: readonly string[] };
/** Per-actor server. `gates` hold patches/imports back; the server applies a request when its gate opens. */
function world() {
  const accounts: Record<string, Record<string, JsonValue>> = { 'user-a': {}, 'user-b': {} };
  let current = sessionOf('user-a');
  const listeners = new Set<() => void>();
  const sent: { actor: string; patch: Patch }[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const patchGates: ReturnType<typeof gated<'ok' | 'fail'>>[] = [];
  const gateFor = (n: number) => { while (patchGates.length <= n) patchGates.push(gated()); return patchGates[n]!; };
  let patchCalls = 0;
  let holdPatches = false;
  const hold = () => { holdPatches = true; };
  const adapter: PlatformAdapter = testAdapter({
    session: () => current,
    subscribe: l => { listeners.add(l); return () => { listeners.delete(l); }; },
    readPreferences: async () => ok(accounts[current.user.id]!),
    importPreferences: async () => ok(accounts[current.user.id]!, '2026-10-29T00:00:00Z'),
    patchPreferences: async patch => {
      const actor = current.user.id;
      sent.push({ actor, patch });
      const n = patchCalls++;
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const verdict = holdPatches ? await gateFor(n).promise : 'ok';
      inFlight--;
      if (verdict === 'fail') return bad();
      accounts[actor] = { ...accounts[actor], ...(patch.set ?? {}) };
      return ok(accounts[actor]!);
    },
  });
  const switchTo = (id: string) => { current = sessionOf(id); listeners.forEach(l => l()); };
  return { adapter, accounts, sent, switchTo, gateFor, hold, maxInFlight: () => maxInFlight };
}
const make = (w: ReturnType<typeof world>, userId: string, sha: (t: string) => Promise<string> = instantSha, importedAt = true) => {
  if (!importedAt) w.adapter.readPreferences = async () => ok({}, null);
  return createPreferenceController({ adapter: w.adapter, userId, sha256: sha, storage: () => memoryStorage() });
};

describe('preference controller: same-account generations (C1)', () => {
  it('a hash that resolves after the replacement started and finished its first read is shown and sent without another remount', async () => {
    const w = world();
    const hash = gated<void>();
    const read = gated<ReturnType<typeof ok>>();
    let reads = 0;
    w.adapter.readPreferences = () => (++reads === 1 ? read.promise : Promise.resolve(ok({})));
    const old = createPreferenceController({ adapter: w.adapter, userId: 'user-a', sha256: async () => { await hash.promise; return HEX; }, storage: () => memoryStorage() });
    old.start();
    old.setTable('t1', oldValue);
    old.stop();
    const next = createPreferenceController({ adapter: w.adapter, userId: 'user-a', sha256: instantSha, storage: () => memoryStorage() });
    next.start();
    await settle();
    expect(next.state().status).toBe('ready');
    hash.release();
    await settle();
    await settle();
    expect(w.accounts['user-a']![KEY]).toEqual(oldValue);
    expect(next.get(KEY)).toEqual(oldValue);
  });

  it('the same with a legacy import still pending when the old hash resolves', async () => {
    const w = world();
    const hash = gated<void>();
    w.adapter.readPreferences = async () => ok({}, null);
    const importGate = gated<ReturnType<typeof ok>>();
    let imports = 0;
    w.adapter.importPreferences = () => (++imports === 1 ? importGate.promise : Promise.resolve(ok({}, '2026-10-29T00:00:00Z')));
    const old = createPreferenceController({ adapter: w.adapter, userId: 'user-a', sha256: async () => { await hash.promise; return HEX; }, storage: () => memoryStorage() });
    old.start();
    await settle();
    old.setTable('t1', oldValue);
    old.stop();
    const next = createPreferenceController({ adapter: w.adapter, userId: 'user-a', sha256: instantSha, storage: () => memoryStorage() });
    next.start();
    await settle();
    expect(next.state().status).toBe('ready');
    hash.release();
    await settle();
    await settle();
    expect(w.accounts['user-a']![KEY]).toEqual(oldValue);
    expect(next.get(KEY)).toEqual(oldValue);
  });

  it('a detached patch that fails is picked up by the already running replacement', async () => {
    const w = world();
    w.hold();
    const old = make(w, 'user-a');
    old.start();
    await settle();
    old.set('lang', 'en');
    await settle();
    old.stop();
    const next = make(w, 'user-a');
    next.start();
    await settle();
    w.gateFor(0).release('fail');
    await settle();
    w.gateFor(1).release('ok');
    await settle();
    await settle();
    expect(w.accounts['user-a']).toEqual({ lang: 'en' });
    expect(w.maxInFlight()).toBe(1);
  });
});

describe('preference controller: write order across generations (C2)', () => {
  it('an old patch in flight and a newer same-key edit of the replacement never overlap and the latest value wins', async () => {
    const w = world();
    w.hold();
    const old = make(w, 'user-a');
    old.start();
    await settle();
    old.set('lang', 'old');
    await settle();
    old.stop();
    const next = make(w, 'user-a');
    next.start();
    await settle();
    next.set('lang', 'new');
    await settle();
    // Completion order is controlled by the test: the newer request is released first.
    w.gateFor(1).release('ok');
    await settle();
    w.gateFor(0).release('ok');
    await settle();
    await settle();
    expect(w.maxInFlight()).toBe(1);
    expect(w.accounts['user-a']).toEqual({ lang: 'new' });
    expect(next.get('lang')).toBe('new');
  });

  it('a failing old patch does not roll back a newer same-key edit', async () => {
    const w = world();
    w.hold();
    const old = make(w, 'user-a');
    old.start();
    await settle();
    old.set('lang', 'old');
    await settle();
    old.stop();
    const next = make(w, 'user-a');
    next.start();
    await settle();
    next.set('lang', 'new');
    w.gateFor(0).release('fail');
    await settle();
    w.gateFor(1).release('ok');
    await settle();
    await settle();
    expect(w.accounts['user-a']).toEqual({ lang: 'new' });
    expect(next.get('lang')).toBe('new');
  });

  it('a delayed older table hash never overrides a newer edit made after the replacement', async () => {
    const w = world();
    const hash = gated<void>();
    const old = make(w, 'user-a', async () => { await hash.promise; return HEX; });
    old.start();
    await settle();
    old.setTable('t1', oldValue);
    old.stop();
    const next = make(w, 'user-a');
    next.start();
    await settle();
    next.setTable('t1', newValue);
    await settle();
    expect(w.accounts['user-a']![KEY]).toEqual(newValue);
    hash.release();
    await settle();
    await settle();
    expect(w.accounts['user-a']![KEY]).toEqual(newValue);
    expect(next.get(KEY)).toEqual(newValue);
  });
});

describe('preference controller: different actor boundary', () => {
  it('an old hash, patch or read continuing after a switch to another user sends nothing as the new user; the old intent returns with its own account', async () => {
    const w = world();
    w.hold();
    const hash = gated<void>();
    const old = make(w, 'user-a', async () => { await hash.promise; return HEX; });
    old.start();
    await settle();
    old.set('lang', 'en');
    old.setTable('t1', oldValue);
    await settle();
    w.switchTo('user-b');
    const other = make(w, 'user-b');
    other.start();
    hash.release();
    w.gateFor(0).release('fail');
    await settle();
    old.stop();
    await settle();
    await settle();
    expect(w.sent.filter(s => s.actor === 'user-b')).toEqual([]);
    expect(w.accounts['user-b']).toEqual({});
    w.switchTo('user-a');
    other.stop();
    const back = make(w, 'user-a');
    back.start();
    await settle();
    w.gateFor(1).release('ok');
    await settle();
    await settle();
    expect(w.accounts['user-a']).toMatchObject({ lang: 'en' });
  });
});

describe('preference controller: shared completion ownership (fix4)', () => {
  it('an old patch that succeeds after the replacement already read the old server value reaches the replacement', async () => {
    const w = world();
    w.hold();
    const old = make(w, 'user-a');
    old.start();
    await settle();
    old.set('lang', 'en');
    await settle();
    old.stop();
    const next = make(w, 'user-a');
    next.start();
    await settle();
    // fix5: the replacement's read waits for the old patch, so it is still loading here (it was ready before); the final guarantees below are unchanged.
    expect(next.state().status).toBe('loading');
    w.gateFor(0).release('ok');
    await settle();
    await settle();
    expect(next.state().status).toBe('ready');
    expect(w.sent).toHaveLength(1);
    expect(w.accounts['user-a']).toEqual({ lang: 'en' });
    expect(next.get('lang')).toBe('en');
  });

  it("the replacement's newer same-key edit stays the latest after the old success and its own patch settle", async () => {
    const w = world();
    w.hold();
    const old = make(w, 'user-a');
    old.start();
    await settle();
    old.set('lang', 'old');
    await settle();
    old.stop();
    const next = make(w, 'user-a');
    next.start();
    await settle();
    next.set('lang', 'new');
    await settle();
    w.gateFor(0).release('ok');
    await settle();
    expect(next.get('lang')).toBe('new');
    w.gateFor(1).release('ok');
    await settle();
    await settle();
    expect(w.sent).toHaveLength(2);
    expect(w.accounts['user-a']).toEqual({ lang: 'new' });
    expect(next.get('lang')).toBe('new');
  });

  it('the same controller stopped and started again while its patch is pending shows the result', async () => {
    const w = world();
    w.hold();
    const c = make(w, 'user-a');
    c.start();
    await settle();
    c.set('lang', 'en');
    await settle();
    c.stop();
    c.start();
    await settle();
    w.gateFor(0).release('ok');
    await settle();
    await settle();
    expect(w.sent).toHaveLength(1);
    expect(c.get('lang')).toBe('en');
    expect(c.state().failure).toBeNull();
  });

  /** `a` is in flight, `b` waits behind it; stop() parks `b` and sends it detached. */
  async function detachedWorld() {
    const w = world();
    w.hold();
    const old = make(w, 'user-a');
    old.start();
    await settle();
    old.set('a', 1);
    await settle();
    old.set('b', 2);
    old.stop();
    const next = make(w, 'user-a');
    next.start();
    await settle();
    return { w, next };
  }

  it('a detached intent adopted by the replacement during its flight is dispatched once and reaches the replacement', async () => {
    const { w, next } = await detachedWorld();
    for (const n of [0, 1, 2, 3]) { w.gateFor(n).release('ok'); await settle(); }
    await settle();
    expect(w.sent.map(s => s.patch)).toEqual([{ set: { a: 1 } }, { set: { b: 2 } }]);
    expect(w.accounts['user-a']).toEqual({ a: 1, b: 2 });
    expect(next.get('a')).toBe(1);
    expect(next.get('b')).toBe(2);
  });

  it('a failed detached dispatch is adopted by the replacement and retried once', async () => {
    const { w, next } = await detachedWorld();
    w.gateFor(0).release('ok');
    await settle();
    w.gateFor(1).release('fail');
    await settle();
    w.gateFor(2).release('ok');
    await settle();
    await settle();
    expect(w.sent.map(s => s.patch)).toEqual([{ set: { a: 1 } }, { set: { b: 2 } }, { set: { b: 2 } }]);
    expect(w.accounts['user-a']).toEqual({ a: 1, b: 2 });
    expect(next.get('b')).toBe(2);
    expect(next.state().failure).toBeNull();
  });

  it('a retry that fails too is not retried again on its own', async () => {
    const { w, next } = await detachedWorld();
    w.gateFor(0).release('ok');
    await settle();
    w.gateFor(1).release('fail');
    await settle();
    w.gateFor(2).release('fail');
    await settle();
    for (const n of [3, 4]) w.gateFor(n).release('ok');
    await settle();
    await settle();
    expect(w.sent).toHaveLength(3);
    expect(next.state().failure).toBe('write');
    expect(next.get('b')).toBe(2);
  });
});

describe('preference controller: read ordered after the account write (fix5)', () => {
  /** A read whose answer is the server state at DISPATCH time but arrives late (gated). */
  function slowReads(w: ReturnType<typeof world>) {
    const reads: { actor: string; release: () => void }[] = [];
    let first = true;
    w.adapter.readPreferences = async () => {
      const actor = (w.adapter.session() as Session).user.id;
      const snapshot = { ...w.accounts[actor] };
      if (first) { first = false; return ok(snapshot); }
      const gate = gated<void>();
      reads.push({ actor, release: () => gate.release() });
      await gate.promise;
      return ok(snapshot);
    };
    return reads;
  }
  async function pendingOld(w: ReturnType<typeof world>) {
    w.hold();
    const old = make(w, 'user-a');
    old.start();
    await settle();
    old.set('lang', 'en');
    await settle();
    old.stop();
    return old;
  }

  it('a replacement read answered after the old patch succeeded shows the confirmed value, not the stale read', async () => {
    const w = world();
    const reads = slowReads(w);
    await pendingOld(w);
    const next = make(w, 'user-a');
    next.start();
    await settle();
    w.gateFor(0).release('ok');
    await settle();
    reads.forEach(r => r.release());
    await settle();
    await settle();
    expect(w.accounts['user-a']).toEqual({ lang: 'en' });
    expect(next.state().status).toBe('ready');
    expect(next.get('lang')).toBe('en');
    expect(w.sent).toHaveLength(1);
  });

  it("the replacement's newer same-key edit after that read is the final value on server and screen", async () => {
    const w = world();
    const reads = slowReads(w);
    await pendingOld(w);
    const next = make(w, 'user-a');
    next.start();
    await settle();
    w.gateFor(0).release('ok');
    await settle();
    reads.forEach(r => r.release());
    await settle();
    next.set('lang', 'fr');
    await settle();
    w.gateFor(1).release('ok');
    await settle();
    await settle();
    expect(w.accounts['user-a']).toEqual({ lang: 'fr' });
    expect(next.get('lang')).toBe('fr');
  });

  it('after a switch to another actor the new actor never shows the old actor data, before or after the old patch settles', async () => {
    const w = world();
    const reads = slowReads(w);
    await pendingOld(w);
    w.switchTo('user-b');
    const other = make(w, 'user-b');
    other.start();
    await settle();
    expect(other.get('lang')).toBeUndefined();
    w.gateFor(0).release('ok');
    await settle();
    reads.forEach(r => r.release());
    await settle();
    await settle();
    expect(other.get('lang')).toBeUndefined();
    expect(other.state().status).toBe('ready');
    expect(w.accounts['user-b']).toEqual({});
    expect(w.sent.every(s => s.actor === 'user-b' || s.patch.set?.lang === 'en')).toBe(true);
  });
});
