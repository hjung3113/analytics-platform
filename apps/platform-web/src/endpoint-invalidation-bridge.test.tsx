import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Suspense, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { defineEndpoint, type ActionOutcome, type ActionResponse, type MenuQuery, type Notice, type PlatformAdapter } from '@ap/contracts';
import { I18nProvider, PlatformProvider, useMenuQuery } from '@ap/kernel';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { EndpointInvalidationBridge } from './endpoint-invalidation-bridge';
import { EQUIPMENT_AXES } from './equipmentAxes';
import { registry } from './menus';
import { createEndpointInvalidation, withNoticeInvalidation } from './real/endpoint-invalidation';
import { createRealAssembly } from './real/http-assembly';

// Mounted real-assembly evidence for #1106: the actual decorated adapter, the actual bridge, the actual Home page's
// useMenuQuery and the Kernel's targeted invalidation, over a controlled transport. No module is replaced. The real
// server and the browser are covered separately (apps/platform-e2e tests-real/notices.admin.real.spec.ts); there is no
// notice CRUD screen in this release, so the write below is issued by the test through the adapter port.

const session = testSession(['platform:view', 'notice:view']);
const other = defineEndpoint<Record<string, never>, string>({ id: 'home.unrelated', menuId: 'home', paramKeys: {}, permission: 'platform:view', requiresScope: false, context: {}, kinds: [], mergeTimeDomain: false });

const action = (outcome: ActionOutcome): ActionResponse<Notice> => ({ outcome, data: null, version: null, fieldErrors: [], replayed: false, correlationId: 'fixture' });
const input = { title: { ko: '제목', en: 'Title' }, content: { ko: '본문', en: 'Body' }, scopeId: null, until: '2099-01-01T00:00:00', idempotencyKey: 'key-1' };

type Fixture = {
  adapter: PlatformAdapter;
  queries: MenuQuery[];
  saves: Array<{ input: unknown; signal: AbortSignal | undefined }>;
  settle: (outcome: ActionOutcome | Error) => void;
};

/** A base adapter whose home.notices answer changes with each call and whose saveNotice settles when the test says so. */
function fixture(): Fixture & { bus: ReturnType<typeof createEndpointInvalidation> } {
  const queries: MenuQuery[] = [];
  const saves: Fixture['saves'] = [];
  const pending: Array<(value: ActionResponse<Notice> | Error) => void> = [];
  const base = testAdapter({
    session: () => session,
    menuQuery: async request => {
      queries.push(request);
      const homeCalls = queries.filter(q => q.endpoint === 'home.notices').length;
      if (request.endpoint === 'home.notices') {
        return { outcome: 'ok', data: [{ id: 'N-1', title: { ko: `공지 ${homeCalls}번째 조회`, en: `Notice read ${homeCalls}` }, scopeId: null, until: '2099-01-01T00:00:00' }], assessments: [], trust: null, correlationId: 'fixture' };
      }
      return { outcome: 'ok', data: 'unrelated', assessments: [], trust: null, correlationId: 'fixture' };
    },
    saveNotice: (inputArg, signal) => new Promise((resolve, reject) => {
      saves.push({ input: inputArg, signal });
      pending.push(value => (value instanceof Error ? reject(value) : resolve(value)));
    }),
  });
  const bus = createEndpointInvalidation();
  return { adapter: withNoticeInvalidation(base, bus), queries, saves, bus, settle: outcome => { const next = pending.shift(); if (!next) throw new Error('no pending save'); next(outcome instanceof Error ? outcome : action(outcome)); } };
}

function Other() {
  const query = useMenuQuery(other, {});
  return <p>{query.response?.outcome === 'ok' ? `other ${String(query.response.data)}` : 'other loading'}</p>;
}

function Mounted({ adapter, bus, children }: { adapter: PlatformAdapter; bus: ReturnType<typeof createEndpointInvalidation>; children?: React.ReactNode }) {
  const Home = registry.menus.find(menu => menu.id === 'home')?.component;
  if (!Home) throw new Error('no home menu');
  return (
    <I18nProvider>
      <PlatformProvider equipmentAxes={EQUIPMENT_AXES} adapter={adapter} registry={registry}>
        <EndpointInvalidationBridge source={bus} />
        <Suspense fallback={null}><Home params={{}} /></Suspense>
        <Other />
        {children}
      </PlatformProvider>
    </I18nProvider>
  );
}

const homeReads = (queries: MenuQuery[]) => queries.filter(query => query.endpoint === 'home.notices').length;
const otherReads = (queries: MenuQuery[]) => queries.filter(query => query.endpoint === 'home.unrelated').length;

afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); });

describe('notice write → targeted Home refresh (#1106)', () => {
  async function mounted(f: ReturnType<typeof fixture>) {
    window.history.replaceState(null, '', '/?v=1');
    const view = render(<Mounted adapter={f.adapter} bus={f.bus} />);
    await screen.findByText(/공지 1번째 조회/);
    await waitFor(() => { expect(otherReads(f.queries)).toBe(1); });
    return view;
  }

  it.each<ActionOutcome>(['ok', 'conflict', 'unknown'])('refetches Home (and nothing else) after a %s answer, keeping the page', async outcome => {
    const f = fixture();
    await mounted(f);
    expect(homeReads(f.queries)).toBe(1);
    const write = f.adapter.saveNotice(input);
    f.settle(outcome);
    await write;
    await screen.findByText(/공지 2번째 조회/);
    expect(homeReads(f.queries)).toBe(2);
    expect(otherReads(f.queries)).toBe(1);
    expect(screen.getByText('other unrelated')).toBeInTheDocument();
  });

  it.each<ActionOutcome>(['invalid', 'forbidden', 'not_found', 'error'])('does not refetch after a judged %s answer: nothing changed', async outcome => {
    const f = fixture();
    await mounted(f);
    const write = f.adapter.saveNotice(input);
    f.settle(outcome);
    await write;
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
    expect(homeReads(f.queries)).toBe(1);
  });

  it('refetches when a write that already left the client rejects (it may have been applied)', async () => {
    const f = fixture();
    await mounted(f);
    const write = f.adapter.saveNotice(input);
    f.settle(new Error('network'));
    await expect(write).rejects.toThrow('network');
    await screen.findByText(/공지 2번째 조회/);
  });

  it('refreshes after a late completion even though the initiating screen unmounted', async () => {
    const f = fixture();
    window.history.replaceState(null, '', '/?v=1');
    function Writer() {
      const [open, setOpen] = useState(true);
      return open ? <button type="button" onClick={() => { void f.adapter.saveNotice(input); setOpen(false); }}>저장 시작</button> : <p>작성 화면 닫힘</p>;
    }
    render(<Mounted adapter={f.adapter} bus={f.bus}><Writer /></Mounted>);
    await screen.findByText(/공지 1번째 조회/);
    await userEvent.click(screen.getByRole('button', { name: '저장 시작' }));
    expect(screen.getByText('작성 화면 닫힘')).toBeInTheDocument();
    expect(homeReads(f.queries)).toBe(1);
    f.settle('ok');
    await screen.findByText(/공지 2번째 조회/);
  });

  it('passes the input, key, version and signal through and returns the adapter\'s result unchanged', async () => {
    const f = fixture();
    const controller = new AbortController();
    const update = { ...input, id: 'N-1', expectedVersion: 'v2' };
    const write = f.adapter.saveNotice(update, controller.signal);
    expect(f.saves).toHaveLength(1);
    expect(f.saves[0]!.input).toBe(update);
    expect(f.saves[0]!.signal).toBe(controller.signal);
    f.settle('ok');
    expect(await write).toEqual(action('ok'));
  });

  it('keeps the adapter identity across renders: no new adapter and no extra read', async () => {
    const f = fixture();
    const view = await mounted(f);
    const reads = f.queries.length;
    view.rerender(<Mounted adapter={f.adapter} bus={f.bus} />);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
    expect(f.queries.length).toBe(reads);
  });
});

describe('the real assembly wires the decorated adapter once per bootstrap', () => {
  it('ready → a stable decorated adapter, an invalidation source, and the other methods untouched', async () => {
    const base = testAdapter({ session: () => session });
    const create = createRealAssembly({ bootstrap: async () => ({ kind: 'ready', adapter: base } as never), where: () => ({ pathname: '/home', search: '' }) });
    const outcome = await create();
    if (!('adapter' in outcome) || !outcome.invalidation) throw new Error('expected a ready assembly with invalidation');
    expect(outcome.adapter).not.toBe(base);
    expect(outcome.adapter.session).toBe(base.session);
    expect(outcome.adapter.menuQuery).toBe(base.menuQuery);
    expect(outcome.adapter.saveNotice).not.toBe(base.saveNotice);
    expect(outcome.adapter.deleteNotice).not.toBe(base.deleteNotice);
    const seen: Array<readonly string[]> = [];
    outcome.invalidation.subscribe(ids => seen.push(ids));
    const ok = testAdapter({ saveNotice: async () => action('ok'), deleteNotice: async () => ({ ...action('ok'), data: { id: 'N-1' } }) });
    const created = await createRealAssembly({ bootstrap: async () => ({ kind: 'ready', adapter: ok } as never), where: () => ({ pathname: '/home', search: '' }) })();
    if (!('adapter' in created) || !created.invalidation) throw new Error('expected a ready assembly');
    created.invalidation.subscribe(ids => seen.push(ids));
    await created.adapter.deleteNotice({ id: 'N-1', expectedVersion: 'v1', idempotencyKey: 'k' });
    expect(seen).toEqual([['home.notices']]);
  });
});
