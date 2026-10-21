import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootstrapBody, ENVELOPE, json, ready, type Call, type Handler } from './test-support.js';

const FIVE_MIN = 300_000;
const QUERY = { endpoint: 'e.x', context: {}, params: {} } as never;
const isBoot = (c: Call) => c.path.endsWith('/platform/bootstrap');

/** A mutable server state: bootstrap and session-state answer from it; other calls need the current CSRF token. */
function remote(initial = { version: 'v1', csrf: 't1' }) {
  const state = { ...initial, bootstrapStatus: 200, stateStatus: 200, apiStatus: 200 };
  const boot = () =>
    state.bootstrapStatus === 200 ? json({ ...bootstrapBody(state.version, state.csrf), generation: 'g-' + state.version }) : new Response('', { status: state.bootstrapStatus });
  const pass: Handler = (call) => {
    if (call.path.endsWith('/session-state')) return state.stateStatus === 200 ? json({ sessionVersion: state.version, generation: 'g-' + state.version }) : new Response('', { status: state.stateStatus });
    if (state.apiStatus !== 200) return new Response('', { status: state.apiStatus });
    if (call.headers['X-CSRF-Token'] !== undefined && call.headers['X-CSRF-Token'] !== state.csrf) return new Response('', { status: 403 });
    return json(ENVELOPE);
  };
  return { state, boot, pass };
}

const NOTE = { chartId: 'c', scopeId: 's', from: 'a', to: 'b', text: 't' };
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('session identity and CSRF token (contract §3)', () => {
  it('session() is the same object until the sessionVersion changes', async () => {
    const r = remote();
    const { adapter, calls } = await ready(r.pass, {}, r.boot);
    const first = adapter.session();
    expect(adapter.session()).toBe(first);
    expect(first.user.id).toBe('u1');
    expect(adapter.publishedMetrics()).toEqual([{ metricId: 'm1', publishedVersion: '1' }]);
    expect(adapter.defaultRangeTo()).toBe('2026-10-02T09:00:00');
    expect(calls.filter(isBoot)).toHaveLength(1);
  });

  it('a 403 on a write refreshes the token (same sessionVersion keeps the session object, no onChange); the write is not resent', async () => {
    const r = remote();
    const { adapter, calls, sent } = await ready(r.pass, {}, r.boot);
    const onChange = vi.fn();
    adapter.subscribe(onChange);
    const before = adapter.session();
    r.state.csrf = 't2'; // the cookie session was renewed: same user, new token
    expect((await adapter.saveAnnotation(NOTE)).message).toBe('http_403');
    await vi.waitFor(() => expect(calls.filter(isBoot)).toHaveLength(2));
    await tick();
    expect(sent()).toHaveLength(1);
    expect((await adapter.saveAnnotation(NOTE)).outcome).toBe('ok');
    expect(sent().map((c) => c.headers['X-CSRF-Token'])).toEqual(['t1', 't2']);
    expect(adapter.session()).toBe(before);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a 403 on a read does not re-bootstrap', async () => {
    const r = remote();
    r.state.apiStatus = 403;
    const { adapter, calls } = await ready(r.pass, {}, r.boot);
    await adapter.menuQuery(QUERY);
    await tick();
    expect(calls.filter(isBoot)).toHaveLength(1);
  });

  it('a new sessionVersion swaps the snapshot object and calls onChange once; publishedMetrics stay fixed', async () => {
    const r = remote();
    const { adapter } = await ready(r.pass, {}, r.boot);
    const onChange = vi.fn();
    adapter.subscribe(onChange);
    const before = adapter.session();
    const metrics = adapter.publishedMetrics();
    r.state.version = 'v2';
    r.state.apiStatus = 401; // a 401 on any call starts the re-check
    await adapter.menuQuery(QUERY);
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(adapter.session()).not.toBe(before);
    expect(adapter.session()).toBe(adapter.session());
    expect(adapter.publishedMetrics()).toBe(metrics);
  });

  it('never writes the token or session to web storage', async () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { setItem });
    vi.stubGlobal('sessionStorage', { setItem });
    try {
      const r = remote();
      const { adapter } = await ready(r.pass, {}, r.boot);
      expect(JSON.stringify(adapter.session())).not.toContain('t1');
      await adapter.saveAnnotation(NOTE);
      expect(setItem).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('subscribe, polling and re-check (contract §4)', () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  const stateCalls = (calls: Call[]) => calls.filter((c) => c.path.endsWith('/session-state')).length;

  it('does not poll without a listener', async () => {
    const r = remote();
    const { calls } = await ready(r.pass, {}, r.boot);
    await vi.advanceTimersByTimeAsync(FIVE_MIN * 3);
    expect(stateCalls(calls)).toBe(0);
  });

  it('polls session-state every 5 minutes while there is a listener, and a same version fires nothing', async () => {
    const r = remote();
    const { adapter, calls } = await ready(r.pass, {}, r.boot);
    const onChange = vi.fn();
    adapter.subscribe(onChange);
    await vi.advanceTimersByTimeAsync(FIVE_MIN - 1);
    expect(stateCalls(calls)).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(stateCalls(calls)).toBe(1);
    await vi.advanceTimersByTimeAsync(FIVE_MIN);
    expect(stateCalls(calls)).toBe(2);
    expect(calls.filter(isBoot)).toHaveLength(1);
    expect(onChange).not.toHaveBeenCalled();
    const poll = calls.find((c) => c.path.endsWith('/session-state'))!;
    expect(poll.method).toBe('GET');
    expect(poll.headers['X-CSRF-Token']).toBeUndefined();
  });

  it('pollMs is configurable', async () => {
    const r = remote();
    const { adapter, calls } = await ready(r.pass, { pollMs: 1000 }, r.boot);
    adapter.subscribe(() => undefined);
    await vi.advanceTimersByTimeAsync(1000);
    expect(stateCalls(calls)).toBe(1);
  });

  it('a different sessionVersion re-bootstraps, swaps the snapshot and calls every listener', async () => {
    const r = remote();
    const { adapter, calls } = await ready(r.pass, {}, r.boot);
    const a = vi.fn();
    const b = vi.fn();
    adapter.subscribe(a);
    adapter.subscribe(b);
    const before = adapter.session();
    r.state.version = 'v2';
    r.state.csrf = 't2';
    await vi.advanceTimersByTimeAsync(FIVE_MIN);
    expect(calls.filter(isBoot)).toHaveLength(2);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(adapter.session()).not.toBe(before);
  });

  it('ignores the generation: a changed generation with the same sessionVersion does nothing', async () => {
    const { adapter, calls } = await ready(
      (call) => (call.path.endsWith('/session-state') ? json({ sessionVersion: 'v1', generation: 'brand-new' }) : json(ENVELOPE)),
      {},
      () => json({ ...bootstrapBody(), generation: 'old' }),
    );
    const onChange = vi.fn();
    adapter.subscribe(onChange);
    await vi.advanceTimersByTimeAsync(FIVE_MIN * 2);
    expect(calls.filter(isBoot)).toHaveLength(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('stops the timer when the last listener unsubscribes, and restarts for a new one', async () => {
    const r = remote();
    const { adapter, calls } = await ready(r.pass, {}, r.boot);
    const offA = adapter.subscribe(() => undefined);
    const offB = adapter.subscribe(() => undefined);
    offA();
    await vi.advanceTimersByTimeAsync(FIVE_MIN);
    expect(stateCalls(calls)).toBe(1);
    offB();
    offB(); // unsubscribing twice is harmless
    await vi.advanceTimersByTimeAsync(FIVE_MIN * 3);
    expect(stateCalls(calls)).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
    adapter.subscribe(() => undefined);
    await vi.advanceTimersByTimeAsync(FIVE_MIN);
    expect(stateCalls(calls)).toBe(2);
  });

  it('subscribing the same callback twice keeps two independent subscriptions', async () => {
    const r = remote();
    const { adapter } = await ready(r.pass, {}, r.boot);
    const onChange = vi.fn();
    const off1 = adapter.subscribe(onChange);
    adapter.subscribe(onChange);
    off1();
    r.state.version = 'v2';
    await vi.advanceTimersByTimeAsync(FIVE_MIN);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('a failed poll waits for the next interval', async () => {
    const r = remote();
    r.state.stateStatus = 500;
    const { adapter, calls } = await ready(r.pass, {}, r.boot);
    adapter.subscribe(() => undefined);
    await vi.advanceTimersByTimeAsync(FIVE_MIN * 2);
    expect(stateCalls(calls)).toBe(2);
    expect(calls.filter(isBoot)).toHaveLength(1);
  });

  it('a 401 on the poll starts a re-check', async () => {
    const r = remote();
    r.state.stateStatus = 401;
    const { adapter, calls } = await ready(r.pass, {}, r.boot);
    adapter.subscribe(() => undefined);
    await vi.advanceTimersByTimeAsync(FIVE_MIN);
    expect(calls.filter(isBoot)).toHaveLength(2);
  });

  describe('single-flight and backoff', () => {
    it('three concurrent 401s start one bootstrap', async () => {
      const r = remote();
      const { adapter, calls } = await ready(() => new Response('', { status: 401 }), {}, r.boot);
      await Promise.all([adapter.menuQuery(QUERY), adapter.menuQuery(QUERY), adapter.validateScope('s').catch(() => undefined)]);
      await vi.advanceTimersByTimeAsync(0);
      expect(calls.filter(isBoot)).toHaveLength(2);
    });

    it('a failed re-check backs off 5 s, 30 s, then 5 min while someone listens', async () => {
      const r = remote();
      const { adapter, calls } = await ready(() => new Response('', { status: 401 }), { pollMs: 10 * FIVE_MIN }, r.boot);
      adapter.subscribe(() => undefined);
      r.state.bootstrapStatus = 503;
      await adapter.menuQuery(QUERY);
      await vi.advanceTimersByTimeAsync(0);
      const boots = () => calls.filter(isBoot).length;
      expect(boots()).toBe(2); // the initial one + the failed re-check
      await vi.advanceTimersByTimeAsync(4_999);
      expect(boots()).toBe(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(boots()).toBe(3);
      await vi.advanceTimersByTimeAsync(29_999);
      expect(boots()).toBe(3);
      await vi.advanceTimersByTimeAsync(1);
      expect(boots()).toBe(4);
      await vi.advanceTimersByTimeAsync(FIVE_MIN - 1);
      expect(boots()).toBe(4);
      await vi.advanceTimersByTimeAsync(1);
      expect(boots()).toBe(5);
      await vi.advanceTimersByTimeAsync(FIVE_MIN);
      expect(boots()).toBe(6);
    });

    it('a 401 during the backoff window does not start another bootstrap', async () => {
      const r = remote();
      const { adapter, calls } = await ready(() => new Response('', { status: 401 }), {}, r.boot);
      r.state.bootstrapStatus = 503;
      await adapter.menuQuery(QUERY);
      await vi.advanceTimersByTimeAsync(0);
      await adapter.menuQuery(QUERY);
      await vi.advanceTimersByTimeAsync(0);
      expect(calls.filter(isBoot)).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(5_000);
      await adapter.menuQuery(QUERY);
      await vi.advanceTimersByTimeAsync(0);
      expect(calls.filter(isBoot)).toHaveLength(3);
    });

    it('a recovered re-check resets the backoff and applies a new version', async () => {
      const r = remote();
      const { adapter, calls } = await ready(() => new Response('', { status: 401 }), {}, r.boot);
      const onChange = vi.fn();
      adapter.subscribe(onChange);
      r.state.bootstrapStatus = 503;
      await adapter.menuQuery(QUERY);
      await vi.advanceTimersByTimeAsync(0);
      r.state.bootstrapStatus = 200;
      r.state.version = 'v2';
      await vi.advanceTimersByTimeAsync(5_000);
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(calls.filter(isBoot)).toHaveLength(3);
    });
  });

  describe('session lost', () => {
    it('a re-bootstrap that answers 401 calls onSessionLost once and stops polling', async () => {
      const r = remote();
      const onSessionLost = vi.fn();
      const { adapter, calls } = await ready(r.pass, { onSessionLost }, r.boot);
      const onChange = vi.fn();
      adapter.subscribe(onChange);
      r.state.stateStatus = 401;
      r.state.bootstrapStatus = 401;
      await vi.advanceTimersByTimeAsync(FIVE_MIN);
      expect(onSessionLost).toHaveBeenCalledTimes(1);
      expect(onChange).not.toHaveBeenCalled();
      const total = calls.length;
      await vi.advanceTimersByTimeAsync(FIVE_MIN * 4);
      expect(calls.length).toBe(total);
      expect(vi.getTimerCount()).toBe(0);
      await adapter.menuQuery(QUERY);
      await vi.advanceTimersByTimeAsync(0);
      expect(onSessionLost).toHaveBeenCalledTimes(1);
    });

    it('a redirect on the re-bootstrap is also a lost session', async () => {
      const onSessionLost = vi.fn();
      let boots = 0;
      const { adapter } = await ready(() => new Response('', { status: 401 }), { onSessionLost }, () => (boots++ === 0 ? json(bootstrapBody()) : new Response(null, { status: 302 })));
      await adapter.menuQuery(QUERY);
      await vi.advanceTimersByTimeAsync(0);
      expect(onSessionLost).toHaveBeenCalledTimes(1);
    });

    it('works without an onSessionLost callback', async () => {
      const r = remote();
      const { adapter } = await ready(() => new Response('', { status: 401 }), {}, r.boot);
      r.state.bootstrapStatus = 401;
      await expect(adapter.menuQuery(QUERY)).resolves.toMatchObject({ message: 'session_expired' });
      await vi.advanceTimersByTimeAsync(0);
    });
  });
});
