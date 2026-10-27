import { act, cleanup, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { groupId, spaceId, type ApiResponse, type AuditEvent, type EntityAuditPage, type EntityAuditRequest, type PlatformAdapter, type Session } from '@ap/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { House } from 'lucide-react';
import { I18nProvider } from '../../i18n';
import { PlatformProvider } from '../../platform/platform';
import { useEntityAudit } from '../../query/query';
import { createRegistry } from '../../registry/registry';
import { memoryStorage, settleQueries, testAdapter, testSession, testSpace } from '../../testing';

const registry = createRegistry({
  spaces: [testSpace()],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [{
    id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' },
    path: '/', icon: House, permission: 'platform:view', requiresScope: false,
    context: { time: 'unsupported', roomNames: 'unsupported', line: 'unsupported', prcGroup: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' },
    pageType: 'overview', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [],
  }],
});

const ev = (id: string, minute: number): AuditEvent => ({
  id, at: `2026-09-01T00:${String(minute).padStart(2, '0')}:00.000Z`, actor: 'park.seo', action: 'update', source: 'user', target: { type: 'metric', id: 'm', scopeId: null },
});
const ok = (data: EntityAuditPage, correlationId = 'c'): ApiResponse<EntityAuditPage> => ({ outcome: 'ok', data, assessments: [], trust: null, correlationId });
const fail = (outcome: 'error' | 'forbidden', message = 'x'): ApiResponse<EntityAuditPage> => ({ outcome, data: null, assessments: [], trust: null, correlationId: 'corr-fail', message });

type Handler = (req: EntityAuditRequest, signal: AbortSignal | undefined, call: number) => Promise<ApiResponse<EntityAuditPage>>;

function fixture(handler: Handler) {
  const make = (id: string): Session => testSession(['platform:view'], { user: { id, name: id, title: { ko: id, en: id } } });
  const sessions = { a: make('user-a'), b: make('user-b') };
  let current: Session = sessions.a;
  const listeners = new Set<() => void>();
  const requests: { req: EntityAuditRequest; signal: AbortSignal | undefined }[] = [];
  const adapter: PlatformAdapter = testAdapter({
    entityAudit: vi.fn((req: EntityAuditRequest, signal?: AbortSignal) => { requests.push({ req, signal }); return handler(req, signal, requests.length); }),
    session: () => current,
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  });
  return { adapter, requests, switchTo: (key: keyof typeof sessions) => { current = sessions[key]; listeners.forEach(l => l()); } };
}

type Seen = { more: ReturnType<typeof useEntityAudit>['timeline']['more']; refetch: () => void };
function Probe({ id = 'm', onSeen }: { id?: string; onSeen: (s: Seen) => void }) {
  const [, force] = useState(0);
  const { query, timeline } = useEntityAudit({ type: 'metric', id, scopeId: null });
  onSeen({ more: timeline.more, refetch: query.refetch });
  return <>
    <p data-testid="events">{timeline.events.map(e => e.id).join(',')}</p>
    <p data-testid="status">{timeline.more.status}</p>
    <p data-testid="added">{timeline.more.last ? `${timeline.more.last.seq}/${timeline.more.last.added}/${timeline.more.last.firstId}` : '-'}</p>
    <p data-testid="error">{timeline.more.error ? `${timeline.more.error.outcome}:${timeline.more.error.message}` : '-'}</p>
    <button type="button" data-testid="rerender" onClick={() => force(n => n + 1)}>r</button>
  </>;
}

function mount(f: ReturnType<typeof fixture>, id?: string) {
  let seen!: Seen;
  const view = render(<I18nProvider><PlatformProvider adapter={f.adapter} registry={registry}><Probe id={id} onSeen={s => { seen = s; }} /></PlatformProvider></I18nProvider>);
  return { seen: () => seen, rerender: (nextId: string) => view.rerender(<I18nProvider><PlatformProvider adapter={f.adapter} registry={registry}><Probe id={nextId} onSeen={s => { seen = s; }} /></PlatformProvider></I18nProvider>) };
}
const text = (id: string) => screen.getByTestId(id).textContent;
const flush = settleQueries;

/** Pages by cursor: undefined → first, 'c1' → second, 'c2' → third. */
const PAGES: Record<string, EntityAuditPage> = {
  first: { events: [ev('e5', 5), ev('e4', 4)], nextCursor: 'c1' },
  c1: { events: [ev('e3', 3), ev('e2', 2)], nextCursor: 'c2' },
  c2: { events: [ev('e1', 1)], nextCursor: null },
};
const paged: Handler = async req => ok(PAGES[req.cursor ?? 'first']!);

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); });
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); vi.unstubAllGlobals(); });

describe('useEntityAudit (ADR-0085)', () => {
  it('reads the first page without a cursor, appends older pages on load and ends at a null cursor', async () => {
    const f = fixture(paged);
    const m = mount(f);
    await flush();
    expect(text('events')).toBe('e5,e4');
    expect(text('status')).toBe('idle');
    expect('cursor' in f.requests[0]!.req).toBe(false);

    act(() => m.seen().more.load());
    expect(text('status')).toBe('loading');
    await flush();
    expect(text('events')).toBe('e5,e4,e3,e2');
    expect(f.requests[1]!.req.cursor).toBe('c1');
    act(() => m.seen().more.load());
    await flush();
    expect(text('events')).toBe('e5,e4,e3,e2,e1');
    expect(text('status')).toBe('end');
    act(() => m.seen().more.load());
    await flush();
    expect(f.requests).toHaveLength(3);
  });

  it('reads a first page without a nextCursor key as the whole list', async () => {
    const f = fixture(async () => ok({ events: [ev('e1', 1)] }));
    mount(f);
    await flush();
    expect(text('status')).toBe('end');
    expect(text('added')).toBe('-');
  });

  it('gives every successful load a new last with seq + 1, also for a second batch of the same size', async () => {
    const f = fixture(async req => ok(req.cursor === undefined ? PAGES.first! : req.cursor === 'c1' ? { events: [ev('e3', 3), ev('e2', 2)], nextCursor: 'c9' } : { events: [ev('f2', 7), ev('f1', 6)], nextCursor: null }));
    const m = mount(f);
    await flush();
    const lasts: unknown[] = [];
    act(() => m.seen().more.load()); await flush();
    lasts.push(m.seen().more.last);
    act(() => m.seen().more.load()); await flush();
    lasts.push(m.seen().more.last);
    expect(lasts[0]).toEqual({ seq: 1, added: 2, firstId: 'e3' });
    expect(lasts[1]).toEqual({ seq: 2, added: 2, firstId: 'f2' });
    expect(lasts[0]).not.toBe(lasts[1]);
  });

  it('drops events whose id is already listed and counts only the new ones', async () => {
    const f = fixture(async req => ok(req.cursor === undefined ? PAGES.first! : { events: [ev('e4', 4), ev('e3', 3)], nextCursor: null }));
    const m = mount(f);
    await flush();
    act(() => m.seen().more.load()); await flush();
    expect(text('events')).toBe('e5,e4,e3');
    expect(text('added')).toBe('1/1/e3');
  });

  it('keeps the list on a failed load and retries the same cursor; the retry success clears the error', async () => {
    let calls = 0;
    const f = fixture(async req => {
      if (req.cursor === 'c1' && ++calls === 1) return fail('error', 'boom');
      return ok(PAGES[req.cursor ?? 'first']!);
    });
    const m = mount(f);
    await flush();
    act(() => m.seen().more.load()); await flush();
    expect(text('events')).toBe('e5,e4');
    expect(text('status')).toBe('error');
    expect(text('error')).toBe('error:boom');
    expect(m.seen().more.error?.correlationId).toBe('corr-fail');
    act(() => m.seen().more.load()); await flush();
    expect(f.requests.map(r => r.req.cursor)).toEqual([undefined, 'c1', 'c1']);
    expect(text('events')).toBe('e5,e4,e3,e2');
    expect(text('error')).toBe('-');
  });

  it('turns a rejected request into an error state', async () => {
    const f = fixture(async req => { if (req.cursor) throw new Error('network'); return ok(PAGES.first!); });
    const m = mount(f);
    await flush();
    act(() => m.seen().more.load()); await flush();
    expect(text('status')).toBe('error');
    expect(text('error')).toContain('network');
  });

  it('blocks load after forbidden', async () => {
    const f = fixture(async req => req.cursor ? fail('forbidden', 'No permission') : ok(PAGES.first!));
    const m = mount(f);
    await flush();
    act(() => m.seen().more.load()); await flush();
    expect(text('error')).toBe('forbidden:No permission');
    act(() => m.seen().more.load()); await flush();
    expect(f.requests).toHaveLength(2);
  });

  it('errors instead of advancing when nextCursor repeats the cursor it was sent or one already seen', async () => {
    const f = fixture(async req => req.cursor === undefined ? ok(PAGES.first!) : req.cursor === 'c1' ? ok({ events: [ev('e3', 3)], nextCursor: 'c1' }) : ok({ events: [], nextCursor: null }));
    const m = mount(f);
    await flush();
    act(() => m.seen().more.load()); await flush();
    expect(text('status')).toBe('error');
    expect(text('error')).toBe('error:Cursor did not advance');
    expect(text('events')).toBe('e5,e4');
  });

  it('starts again from the first page and aborts an in-flight load when the ref changes', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const f = fixture(async (req, _signal, call) => {
      if (call === 2) { await gate; return ok(PAGES.c1!); }
      return ok(req.cursor === undefined ? PAGES.first! : PAGES.c1!);
    });
    const m = mount(f, 'm');
    await flush();
    act(() => m.seen().more.load());
    expect(text('status')).toBe('loading');
    m.rerender('other');
    expect(f.requests[1]!.signal?.aborted).toBe(true);
    release();
    await flush();
    expect(text('events')).toBe('e5,e4');
    expect(text('status')).toBe('idle');
    expect(text('added')).toBe('-');
    expect('cursor' in f.requests[2]!.req).toBe(false);
  });

  it('drops appended pages when the user changes', async () => {
    const f = fixture(paged);
    const m = mount(f);
    await flush();
    act(() => m.seen().more.load()); await flush();
    expect(text('events')).toBe('e5,e4,e3,e2');
    act(() => f.switchTo('b'));
    expect(text('events')).toBe('');
    await flush();
    expect(text('events')).toBe('e5,e4');
    expect(text('added')).toBe('-');
  });

  it('drops appended pages when the same ref is read again', async () => {
    const f = fixture(paged);
    const m = mount(f);
    await flush();
    act(() => m.seen().more.load()); await flush();
    act(() => m.seen().refetch());
    await flush();
    expect(text('events')).toBe('e5,e4');
    expect(text('status')).toBe('idle');
    expect(text('added')).toBe('-');
    expect('cursor' in f.requests[2]!.req).toBe(false);
  });

  it('hides the appended pages while the first page is read again, and drops them when it lands', async () => {
    let release: (() => void) | null = null;
    let firstCalls = 0;
    const f = fixture(async req => {
      if (req.cursor) return ok(PAGES[req.cursor]!);
      firstCalls += 1;
      if (firstCalls === 1) return ok(PAGES.first!);
      await new Promise<void>(resolve => { release = resolve; });
      return ok(PAGES.first!);
    });
    const m = mount(f);
    await flush();
    act(() => m.seen().more.load()); await flush();
    expect(text('events')).toBe('e5,e4,e3,e2');
    act(() => m.seen().refetch());
    await flush();
    expect(text('events')).toBe('e5,e4');
    expect(text('added')).toBe('-');
    act(() => release?.()); await flush();
    expect(text('events')).toBe('e5,e4');
    expect(text('status')).toBe('idle');
  });

  it('drops the appended pages when the adapter answers the refetch with the identical response object', async () => {
    const same = ok(PAGES.first!);
    const f = fixture(async req => (req.cursor ? ok(PAGES[req.cursor]!) : same));
    const m = mount(f);
    await flush();
    act(() => m.seen().more.load()); await flush();
    expect(text('events')).toBe('e5,e4,e3,e2');
    act(() => m.seen().refetch());
    await flush();
    expect(text('events')).toBe('e5,e4');
    expect(text('status')).toBe('idle');
    expect(text('added')).toBe('-');
    act(() => m.seen().more.load()); await flush();
    expect(text('events')).toBe('e5,e4,e3,e2');
  });

  it('aborts an in-flight load on unmount', async () => {
    const f = fixture(async req => req.cursor ? new Promise<ApiResponse<EntityAuditPage>>(() => {}) : ok(PAGES.first!));
    const m = mount(f);
    await flush();
    act(() => m.seen().more.load());
    cleanup();
    expect(f.requests[1]!.signal?.aborted).toBe(true);
  });

  it('ignores a second load while one is in flight', async () => {
    const f = fixture(paged);
    const m = mount(f);
    await flush();
    act(() => { m.seen().more.load(); m.seen().more.load(); });
    await flush();
    expect(f.requests).toHaveLength(2);
  });
});
