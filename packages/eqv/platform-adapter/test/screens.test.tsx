import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ApiResponse } from '@ap/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { eqvScreens } from '../src/index.js';
import { createFakeHost, deferred, ok, response, type FakeHostOptions, type QueryCall } from './fake-host.js';
import { bindings, contextData, EQUIPMENT, HOST_TIME, layout, mappings, pages } from './replay-fixture.js';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// Radix-based @ap/ui controls render slowly under full-suite load (EV#88).
configure({ asyncUtilTimeout: 5000 });
afterEach(cleanup);

const CONTEXT_ID = 'eqv.topview-context';
const EVENTS_ID = 'eqv.topview-events';
const SCREENS = [['topview', eqvScreens.topview], ['focus', eqvScreens.focus]] as const;

/** A healthy server: the context, then the events in two pages. */
const server = (overrides: { context?: ApiResponse<unknown>; events?: (token: string | undefined) => ApiResponse<unknown> } = {}) => async ({ id, params }: QueryCall) => {
  if (id === CONTEXT_ID) return overrides.context ?? ok(contextData());
  const token = (params as { continuationToken?: string }).continuationToken;
  const [first, second] = pages();
  return overrides.events?.(token) ?? (token === undefined ? ok(first) : ok(second));
};
const hostFor = (options: Partial<FakeHostOptions> = {}) => createFakeHost({
  page: { equipment: EQUIPMENT }, context: HOST_TIME, query: server(), ...options,
});
const row = (id: string) => document.querySelector(`tr[data-occurrence-id="${id}"]`);
const loaded = () => waitFor(() => expect(screen.queryByText('불러오는 중…')).toBeNull());

describe('queries', () => {
  it('asks only the two declared endpoints, with the screen signal, and follows continuation pages in server order', async () => {
    const fake = hostFor();
    const Screen = eqvScreens.focus;
    render(<Screen host={fake.host} params={{}} />);
    await waitFor(() => expect(row('occ-open')).not.toBeNull());
    expect(fake.log.queries.map(({ id, params }) => [id, params])).toEqual([
      [CONTEXT_ID, { equipmentId: EQUIPMENT }],
      [EVENTS_ID, { equipmentId: EQUIPMENT }],
      [EVENTS_ID, { equipmentId: EQUIPMENT, continuationToken: 'p2' }],
    ]);
    // Both pages are in one batch: a row from the first page and one from the last.
    expect(row('occ-carrier')).not.toBeNull();
    act(() => fake.abortScreen());
    expect(fake.log.queries.every(({ signal }) => signal?.aborted)).toBe(true);
  });
});

describe('states that need the user', () => {
  it.each(SCREENS)('%s: an unsupported time is shown as not applied and replay is not queried', async (name, Screen) => {
    const fake = hostFor({ unsupported: ['time'] });
    render(<Screen host={fake.host} params={{}} />);
    screen.getByText('이 화면에는 시간 구간이 적용되지 않습니다');
    expect(fake.log.queries.map(call => call.id)).toEqual(name === 'topview' ? ['eqv.equipment-options'] : []);
    if (name === 'topview') await waitFor(() => expect(screen.queryByText('설비 목록을 불러오는 중…')).toBeNull());
  });

  it.each(SCREENS)('%s: no equipment asks for one and does not query replay', async (name, Screen) => {
    const fake = hostFor({ page: {} });
    render(<Screen host={fake.host} params={{}} />);
    screen.getByText(name === 'topview' ? '위에서 설비를 고르세요' : 'Top View에서 설비를 고르세요');
    expect(fake.log.queries.map(call => call.id)).toEqual(name === 'topview' ? ['eqv.equipment-options'] : []);
    if (name === 'topview') await waitFor(() => expect(screen.queryByText('설비 목록을 불러오는 중…')).toBeNull());
  });

  it.each(SCREENS)('%s: no applied time asks for one and does not query replay', async (name, Screen) => {
    const fake = hostFor({ context: { from: HOST_TIME.from, to: null } });
    render(<Screen host={fake.host} params={{}} />);
    screen.getByText('시간 구간을 고르세요');
    expect(fake.log.queries.map(call => call.id)).toEqual(name === 'topview' ? ['eqv.equipment-options'] : []);
    if (name === 'topview') await waitFor(() => expect(screen.queryByText('설비 목록을 불러오는 중…')).toBeNull());
  });
});

describe('load races', () => {
  it.each(SCREENS)('%s: a new equipment aborts the in-flight load and its late response is not shown', async (_name, Screen) => {
    const late = deferred<ApiResponse<unknown>>();
    const fake = hostFor({
      query: async (call) => {
        if (call.id === CONTEXT_ID && (call.params as { equipmentId: string }).equipmentId === 'eq-slow') return await late.promise;
        return await server()(call);
      },
    });
    fake.setPage({ equipment: 'eq-slow' });
    render(<Screen host={fake.host} params={{}} />);
    await waitFor(() => expect(fake.log.queries.filter(call => call.id === CONTEXT_ID)).toHaveLength(1));
    const first = fake.log.queries.find(call => call.id === CONTEXT_ID)!;
    fake.setPage({ equipment: EQUIPMENT });
    await waitFor(() => expect(first.signal?.aborted).toBe(true));
    await loaded();
    await act(async () => { late.resolve(response('error', null, { message: 'stale frame' })); await late.promise; });
    expect(screen.queryByText(/stale frame/)).toBeNull();
    expect(fake.log.errors).toEqual([]);
  });
});

describe('request generations', () => {
  it.each(SCREENS)('%s: restoring an earlier equipment waits for a new response instead of reviving the old result', async (name, Screen) => {
    const late = deferred<ApiResponse<unknown>>();
    let calls = 0;
    const fake = hostFor({
      detailSlot: true,
      query: async (call) => {
        if (call.id === CONTEXT_ID && ++calls === 2) return await late.promise;
        return await server()(call);
      },
    });
    render(<Screen host={fake.host} params={{}} />);
    await waitFor(() => expect(document.querySelector('tr[data-occurrence-id], [data-layer="replay"]')).not.toBeNull());
    fake.setPage({ equipment: null });
    await screen.findByText(name === 'topview' ? '설비 목록을 다시 불러오세요' : 'Top View에서 설비를 고르세요');
    fake.setPage({ equipment: EQUIPMENT });
    await waitFor(() => expect(calls).toBe(2));
    screen.getByText('불러오는 중…');
    expect(document.querySelector('tr[data-occurrence-id], [data-layer="replay"]')).toBeNull();
    await act(async () => { late.resolve(ok(contextData())); await late.promise; });
    await waitFor(() => expect(document.querySelector('tr[data-occurrence-id], [data-layer="replay"]')).not.toBeNull());
  });

  it.each(SCREENS)('%s: A → B → A with B unsettled does not show the first A result', async (_name, Screen) => {
    const slowB = deferred<ApiResponse<unknown>>();
    let aCalls = 0;
    const fake = hostFor({
      query: async (call) => {
        const equipmentId = (call.params as { equipmentId: string }).equipmentId;
        if (call.id === CONTEXT_ID && equipmentId === 'eq-b') return await slowB.promise;
        if (call.id === CONTEXT_ID && ++aCalls === 2) return await new Promise<never>(() => undefined);
        return await server()(call);
      },
    });
    render(<Screen host={fake.host} params={{}} />);
    await waitFor(() => expect(document.querySelector('tr[data-occurrence-id], [data-layer="replay"]')).not.toBeNull());
    fake.setPage({ equipment: 'eq-b' });
    await screen.findByText('불러오는 중…');
    fake.setPage({ equipment: EQUIPMENT });
    await waitFor(() => expect(aCalls).toBe(2));
    screen.getByText('불러오는 중…');
    expect(document.querySelector('tr[data-occurrence-id], [data-layer="replay"]')).toBeNull();
  });
});

describe('outcomes', () => {
  const failing = (outcome: ApiResponse<unknown>['outcome']) => hostFor({ query: server({ context: response(outcome, null, { message: `${outcome}-text` }) }) });

  it.each([
    ['error', '불러오지 못했습니다', /error-text/],
    ['timeout', '응답 시간 초과', /서버가 제때 응답하지 않았습니다/],
    ['too_large', '구간이 너무 큽니다', /최대 8시간까지.*기간을 8시간 이하로 줄이세요/],
  ] as const)(
    '%s is a screen-local state with the message and the reportError id, and no status call', async (outcome, title, message) => {
      const fake = failing(outcome);
      const Screen = eqvScreens.topview;
      render(<Screen host={fake.host} params={{}} />);
      await screen.findByText(title);
      screen.getByText(message);
      if (outcome !== 'error') expect(screen.queryByText(new RegExp(`${outcome}-text`))).toBeNull();
      screen.getByText('오류 ID err-1');
      expect(fake.log.statuses).toEqual([]);
    });

  it('empty shows the empty state and makes no status call', async () => {
    const fake = hostFor({ query: server({ context: response('empty', null) }) });
    const Screen = eqvScreens.topview;
    render(<Screen host={fake.host} params={{}} />);
    await screen.findByText('이 구간에 표시할 Occurrence가 없습니다');
    expect(fake.log.statuses).toEqual([]);
  });

  it('forbidden sets auth_required; the next load of an equipment the server answers returns to ready and shows the data', async () => {
    const fake = hostFor({
      page: { equipment: 'eq-denied' },
      query: async (call) => (call.params as { equipmentId: string }).equipmentId === EQUIPMENT ? await server()(call) : response('forbidden', null),
    });
    const Screen = eqvScreens.focus;
    render(<Screen host={fake.host} params={{}} />);
    await waitFor(() => expect(fake.log.statuses).toEqual(['auth_required']));
    fake.setPage({ equipment: EQUIPMENT });
    await waitFor(() => expect(row('occ-open')).not.toBeNull());
    expect(fake.log.statuses).toEqual(['auth_required', 'ready']);
    expect(screen.queryByText('데이터 오류')).toBeNull();
  });

  it('forbidden → a local error on the next equipment also returns the host to ready', async () => {
    let allowed = false;
    const fake = hostFor({ query: async () => allowed ? response('error', null, { message: 'local' }) : response('forbidden', null) });
    const Screen = eqvScreens.topview;
    render(<Screen host={fake.host} params={{}} />);
    await waitFor(() => expect(fake.log.statuses).toEqual(['auth_required']));
    allowed = true;
    fake.setPage({ equipment: 'eq-synth-02' });
    await waitFor(() => expect(fake.log.statuses).toEqual(['auth_required', 'ready']));
    await screen.findByText('불러오지 못했습니다');
  });

  it('non-clear assessments become notices; unknown is not worded as clear', async () => {
    const fake = hostFor({ query: server({ events: (token) => ok(token === undefined ? pages()[0] : pages()[1], token === undefined ? [{ kind: 'coverage', state: 'unknown', reason: 'check_failed' }, { kind: 'collection', state: 'clear' }] : []) }) });
    const Screen = eqvScreens.focus;
    render(<Screen host={fake.host} params={{}} />);
    await screen.findByText('범위: 확인하지 못했습니다 (점검 실패) — 이상 없음이 아닙니다');
    expect(screen.queryByText(/수집/)).toBeNull();
  });

  it.each(SCREENS)('%s: a tampered Mapping Version is an error state, not a partial replay', async (_name, Screen) => {
    const tampered = { ...mappings[0]!, entries: mappings[0]!.entries.slice(0, -1) };
    const fake = hostFor({ query: server({ context: ok({ ...contextData(), mappings: [tampered, mappings[1]!] }) }) });
    render(<Screen host={fake.host} params={{}} />);
    await screen.findByText('데이터 오류');
    screen.getByText(/내용 hash가 맞지 않습니다/);
    expect(document.querySelector('tr[data-occurrence-id]')).toBeNull();
  });

  it.each(SCREENS)('%s: two Bindings sharing a Mapping hash but naming different valid Layouts are a data error', async (_name, Screen) => {
    const [first] = bindings.bindings;
    const other = { ...layout, id: 'eq-synth-01-layout-b' };
    const twin = { ...bindings, bindings: [first!, { ...first!, layoutId: other.id, effectiveFrom: '2026-01-01T10:04:30.000' }] };
    const fake = hostFor({ query: server({ context: ok({ layouts: [layout, other], bindings: twin, mappings }) }) });
    render(<Screen host={fake.host} params={{}} />);
    await screen.findByText('데이터 오류');
    screen.getByText(/layoutId/);
    expect(document.querySelector('tr[data-occurrence-id]')).toBeNull();
  });

});

describe('Focus detail', () => {
  it('with detailSlot, selecting an Occurrence shows its evidence in the host slot and a reset clears it; there is no inline tab', async () => {
    const fake = hostFor({ detailSlot: true });
    const Screen = eqvScreens.focus;
    render(<Screen host={fake.host} params={{}} />);
    await waitFor(() => expect(row('occ-pm1-process')).not.toBeNull());
    expect(screen.queryByRole('tab', { name: '근거 상세' })).toBeNull();
    fireEvent.click(row('occ-pm1-process')!);
    await waitFor(() => expect(fake.log.shown.at(-1)?.label).toBe('근거 상세 · occ-pm1-process'));
    const cleared = fake.log.cleared;
    fake.setPage({ equipment: 'eq-synth-02' });
    await waitFor(() => expect(fake.log.cleared).toBeGreaterThan(cleared));
  });

  it('without detailSlot the 근거 상세 tab is inline', async () => {
    const fake = hostFor();
    const Screen = eqvScreens.focus;
    render(<Screen host={fake.host} params={{}} />);
    await waitFor(() => expect(row('occ-pm1-process')).not.toBeNull());
    fireEvent.click(row('occ-pm1-process')!);
    fireEvent.mouseDown(screen.getByRole('tab', { name: '근거 상세' }));
    await screen.findByRole('region', { name: '근거 상세 occ-pm1-process' });
  });

  it('Top View로 navigates to the topview screen with the equipment', async () => {
    const fake = hostFor();
    const Screen = eqvScreens.focus;
    render(<Screen host={fake.host} params={{}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Top View로' }));
    expect(fake.log.navigations).toEqual([{ screen: 'topview', page: { equipment: EQUIPMENT } }]);
  });
});

describe('Top View', () => {
  it('shows the layout with the scene state as of the padded end of the window, and opens Focus', async () => {
    const fake = hostFor();
    const Screen = eqvScreens.topview;
    render(<Screen host={fake.host} params={{}} />);
    await screen.findAllByText('2026-01-01 10:30:00');
    expect(document.querySelector('[data-layer="replay"]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Focus 열기' }));
    expect(fake.log.navigations).toEqual([{ screen: 'focus', page: { equipment: EQUIPMENT, entityType: 'job', anchor: '58' } }]);
  });

  it.each([
    [null, '1'],
    ['pm-b', '19'],
    ['pm-a', '18'],
  ] as const)('Focus 열기 at 10:08:30 with %s selected opens Focus on that Component\'s open Occurrence (its RecordSequence), else the first one open at the cursor', async (id, anchor) => {
    const fake = hostFor({ context: { from: HOST_TIME.from, to: '2026-01-01T10:08:30' } });
    const Screen = eqvScreens.topview;
    render(<Screen host={fake.host} params={{}} />);
    await screen.findByText('Component를 선택하세요');
    if (id !== null) fireEvent.click(document.querySelector(`[data-component-id="${id}"]`)!);
    fireEvent.click(screen.getByRole('button', { name: 'Focus 열기' }));
    expect(fake.log.navigations).toEqual([{ screen: 'focus', page: { equipment: EQUIPMENT, entityType: 'job', anchor } }]);
  });

  it('with detailSlot, selecting a Component shows its detail in the host slot', async () => {
    const fake = hostFor({ detailSlot: true });
    const Screen = eqvScreens.topview;
    render(<Screen host={fake.host} params={{}} />);
    await screen.findAllByText('2026-01-01 10:30:00');
    fireEvent.click(document.querySelector('[data-component-id="pm-a"]')!);
    await waitFor(() => expect(fake.log.shown.at(-1)?.label).toBe('Component · pm-a'));
    expect(screen.queryByRole('region', { name: 'Component 상세' })).toBeNull();
  });

  it('without detailSlot the Component detail is an inline panel', async () => {
    const fake = hostFor();
    const Screen = eqvScreens.topview;
    render(<Screen host={fake.host} params={{}} />);
    await screen.findByText('Component를 선택하세요');
    fireEvent.click(document.querySelector('[data-component-id="pm-a"]')!);
    await screen.findByRole('region', { name: 'Component 상세 pm-a' });
  });
});

describe('Top View Component detail words', () => {
  it.each([
    ['pm-b', /처리 중/],
    ['pm-a', /기록된 활동 없음/],
  ] as const)('%s shows the activity in Korean with its evidence badge', async (id, words) => {
    const fake = hostFor();
    const Screen = eqvScreens.topview;
    render(<Screen host={fake.host} params={{}} />);
    await screen.findByText('Component를 선택하세요');
    fireEvent.click(document.querySelector(`[data-component-id="${id}"]`)!);
    const region = await screen.findByRole('region', { name: `Component 상세 ${id}` });
    expect(region.textContent).toMatch(words);
    expect(region.textContent).not.toMatch(/processing|no recorded activity/);
    expect(region.textContent).toMatch(/활동 근거/);
  });
});

describe('Focus 재생 구간 in the page keys', () => {
  const rangeInputs = () => [screen.getByLabelText('시작'), screen.getByLabelText('끝')] as HTMLInputElement[];

  it('applying a range writes rangeFrom/rangeTo through the host, and a remount reads the range back', async () => {
    const fake = hostFor();
    const Screen = eqvScreens.focus;
    const first = render(<Screen host={fake.host} params={{}} />);
    await screen.findByRole('form', { name: '구간' });
    const [from, to] = rangeInputs();
    fireEvent.change(from!, { target: { value: '2026-01-01T10:05:00.000' } });
    fireEvent.change(to!, { target: { value: '2026-01-01T10:12:00.000' } });
    fireEvent.submit(screen.getByRole('form', { name: '구간' }));
    expect(fake.log.pageWrites).toEqual([{ rangeFrom: '2026-01-01T10:05:00.000', rangeTo: '2026-01-01T10:12:00.000' }]);
    first.unmount();
    render(<Screen host={fake.host} params={{}} />);
    await screen.findByRole('form', { name: '구간' });
    expect(rangeInputs().map((input) => input.value)).toEqual(['2026-01-01T10:05:00.000', '2026-01-01T10:12:00.000']);
  });

  it.each([
    ['reversed', '2026-01-01T10:12:00.000', '2026-01-01T10:05:00.000'],
    ['equal', '2026-01-01T10:05:00.000', '2026-01-01T10:05:00.000'],
    ['malformed', 'not-a-time', '2026-01-01T10:12:00.000'],
    ['missing end', '2026-01-01T10:05:00.000', null],
    ['impossible calendar', '2026-02-30T10:00:00.000', '2026-02-30T11:00:00.000'],
  ] as const)('a %s pair in the page keys is ignored, not applied', async (_name, rangeFrom, rangeTo) => {
    const fake = hostFor({ page: { equipment: EQUIPMENT, rangeFrom, ...(rangeTo === null ? {} : { rangeTo }) } });
    const Screen = eqvScreens.focus;
    render(<Screen host={fake.host} params={{}} />);
    await screen.findByRole('form', { name: '구간' });
    expect(rangeInputs().map((input) => input.value)).not.toContain(rangeFrom);
  });

  it('a saved range survives a host refresh of the same equipment, time and entry', async () => {
    const fake = hostFor({ page: { equipment: EQUIPMENT, rangeFrom: '2026-01-01T10:05:00.000', rangeTo: '2026-01-01T10:12:00.000' } });
    const Screen = eqvScreens.focus;
    render(<Screen host={fake.host} params={{}} />);
    await screen.findByRole('form', { name: '구간' });
    fake.setPage({ unrelated: 'x' });
    expect(rangeInputs().map((input) => input.value)).toEqual(['2026-01-01T10:05:00.000', '2026-01-01T10:12:00.000']);
    expect(fake.log.pageWrites).toEqual([]);
    expect(fake.host.page('rangeFrom')).toBe('2026-01-01T10:05:00.000');
  });

  it.each([
    ['applied time', (fake: ReturnType<typeof hostFor>) => fake.setContext({ from: '2026-01-02T10:00:00', to: '2026-01-02T11:00:00' })],
    ['equipment', (fake: ReturnType<typeof hostFor>) => fake.setPage({ equipment: 'other-tool' })],
    ['entry anchor', (fake: ReturnType<typeof hostFor>) => fake.setPage({ entityType: 'occurrence', anchor: 'occ-pm1-process' })],
  ] as const)('a saved range is dropped when the %s changes', async (_name, change) => {
    const fake = hostFor({ page: { equipment: EQUIPMENT, rangeFrom: '2026-01-01T10:05:00.000', rangeTo: '2026-01-01T10:12:00.000' } });
    const Screen = eqvScreens.focus;
    render(<Screen host={fake.host} params={{}} />);
    await screen.findByRole('form', { name: '구간' });
    change(fake);
    await waitFor(() => expect(fake.host.page('rangeFrom')).toBeNull());
    expect(fake.host.page('rangeTo')).toBeNull();
  });
});

describe('Korean copy', () => {
  it.each([
    ['topview', eqvScreens.topview, '2026-01-01 10:30:00'],
    ['focus', eqvScreens.focus, '2026-01-01 10:'],
  ] as const)('%s: times read YYYY-MM-DD HH:mm:ss and no control keeps an English label', async (_name, Screen, shown) => {
    const fake = hostFor();
    render(<Screen host={fake.host} params={{}} />);
    await waitFor(() => expect(document.querySelector('table, [data-layer="replay"]')).not.toBeNull());
    const text = document.body.textContent ?? '';
    expect(text).toContain(shown);
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    expect(text).not.toMatch(/Sequence step|이전 record|다음 record/);
  });

  it('the evidence detail names its provenance rows in Korean (Ruleset Version stays a glossary term)', async () => {
    const fake = hostFor();
    const Screen = eqvScreens.focus;
    render(<Screen host={fake.host} params={{}} />);
    await waitFor(() => expect(row('occ-pm1-process')).not.toBeNull());
    fireEvent.click(row('occ-pm1-process')!);
    fireEvent.mouseDown(screen.getByRole('tab', { name: '근거 상세' }));
    const detail = await screen.findByRole('region', { name: '근거 상세 occ-pm1-process' });
    for (const label of ['합성 데이터', 'Mapping Version', 'Ruleset Version']) expect(within(detail).getByText(label)).toBeTruthy();
    expect(within(detail).queryByText('synthetic')).toBeNull();
  });
});


describe('Top View equipment bar (#1644)', () => {
  const optionsId = 'eqv.equipment-options';
  const options = [{ id: EQUIPMENT, label: EQUIPMENT, dataRange: HOST_TIME }, { id: 'eq-synth-02', label: 'eq-synth-02', dataRange: null }];
  const renderBar = (answer: ApiResponse<unknown> | Promise<ApiResponse<unknown>> = ok({ options }), context = HOST_TIME, chosen: string | null = EQUIPMENT, writable = true) => {
    const fake = hostFor({ page: chosen ? { equipment: chosen } : {}, context, query: call => call.id === optionsId ? Promise.resolve(answer) : server()(call) });
    const setTime = vi.fn();
    if (writable) fake.host.setTime = setTime;
    const Screen = eqvScreens.topview;
    render(<Screen host={fake.host} params={{}} />);
    return { fake, setTime };
  };
  it('offers a labelled selector without equipment and writes the selected page key', async () => {
    const { fake } = renderBar(ok({ options }), HOST_TIME, null);
    screen.getByText('위에서 설비를 고르세요');
    const select = await screen.findByRole('combobox', { name: '설비' });
    // jsdom has no scrolling API; the real Radix Select scrolls its focused option.
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
    try {
      fireEvent.keyDown(select, { key: 'ArrowDown' });
      fireEvent.click(await screen.findByRole('option', { name: EQUIPMENT }));
      expect(fake.log.pageWrites).toEqual([{ equipment: EQUIPMENT }]);
      await screen.findByText('Component를 선택하세요');
    } finally {
      if (descriptor) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', descriptor);
      else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
    }
  });
  it('keeps the same focused trigger through selection and the ready board', async () => {
    const refreshed = deferred<ApiResponse<unknown>>();
    const fake = hostFor({ page: {}, query: call => call.id === optionsId ? Promise.resolve(ok({ options })) : server()(call) });
    const Screen = eqvScreens.topview;
    const view = render(<Screen host={fake.host} params={{}} />);
    const setPage = fake.host.setPage;
    fake.host.setPage = patch => {
      setPage(patch);
      // The real module host is replaced when applied URL state changes.
      const next = hostFor({ page: { equipment: EQUIPMENT }, query: call => call.id === optionsId ? refreshed.promise : server()(call) });
      view.rerender(<Screen host={next.host} params={{}} />);
    };
    const select = await screen.findByRole('combobox', { name: '설비' });
    await waitFor(() => expect((select as HTMLButtonElement).disabled).toBe(false));
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
    try {
      select.focus();
      fireEvent.keyDown(select, { key: 'ArrowDown' });
      fireEvent.click(await screen.findByRole('option', { name: EQUIPMENT }));
      expect(fake.log.pageWrites).toEqual([{ equipment: EQUIPMENT }]);
      await screen.findByText('Component를 선택하세요');
      expect(screen.getByRole('combobox', { name: '설비' })).toBe(select);
      await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
      await act(async () => { refreshed.resolve(ok({ options })); await refreshed.promise; });
      await waitFor(() => expect(document.activeElement).toBe(select), { timeout: 1000 });
    } finally {
      if (descriptor) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', descriptor);
      else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
    }
  });
  it('keeps the received list usable and focused while a replaced host refreshes it', async () => {
    const pending = deferred<ApiResponse<unknown>>();
    const fake = hostFor({ page: {}, query: call => call.id === optionsId ? Promise.resolve(ok({ options })) : server()(call) });
    const Screen = eqvScreens.topview;
    const view = render(<Screen host={fake.host} params={{}} />);
    const setPage = fake.host.setPage;
    fake.host.setPage = patch => {
      setPage(patch);
      const next = hostFor({ page: { equipment: EQUIPMENT }, query: call => call.id === optionsId ? pending.promise : server()(call) });
      view.rerender(<Screen host={next.host} params={{}} />);
    };
    const select = await screen.findByRole('combobox', { name: '설비' }) as HTMLButtonElement;
    await waitFor(() => expect(select.disabled).toBe(false));
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
    try {
      select.focus();
      fireEvent.keyDown(select, { key: 'ArrowDown' });
      fireEvent.click(await screen.findByRole('option', { name: EQUIPMENT }));
      await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
      // The refresh is still pending: nothing below settles it.
      expect(select.disabled).toBe(false);
      await waitFor(() => expect(document.activeElement).toBe(select), { timeout: 1000 });
    } finally {
      if (descriptor) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', descriptor);
      else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
    }
  });
  describe('focus through list failure and retry', () => {
    const retryButton = () => screen.getByRole('button', { name: '다시 시도' });
    const failedThenRetry = async () => {
      const retries: Array<ReturnType<typeof deferred<ApiResponse<unknown>>>> = [];
      let attempts = 0;
      const fake = hostFor({ page: {}, query: call => {
        if (call.id !== optionsId) return server()(call);
        if (++attempts === 1) return Promise.resolve(response('error', null));
        const next = deferred<ApiResponse<unknown>>();
        retries.push(next);
        return next.promise;
      } });
      const Screen = eqvScreens.topview;
      render(<Screen host={fake.host} params={{}} />);
      await screen.findByText('설비 목록을 불러오지 못했습니다');
      retryButton().focus();
      fireEvent.click(retryButton());
      await screen.findByText('설비 목록을 불러오는 중…');
      return { retries };
    };
    it('keeps focus on the retry action when the list fails after a selection', async () => {
      const refreshed = deferred<ApiResponse<unknown>>();
      const fake = hostFor({ page: {}, query: call => call.id === optionsId ? Promise.resolve(ok({ options })) : server()(call) });
      const Screen = eqvScreens.topview;
      const view = render(<Screen host={fake.host} params={{}} />);
      const setPage = fake.host.setPage;
      fake.host.setPage = patch => {
        setPage(patch);
        const next = hostFor({ page: { equipment: EQUIPMENT }, query: call => call.id === optionsId ? refreshed.promise : server()(call) });
        view.rerender(<Screen host={next.host} params={{}} />);
      };
      const select = await screen.findByRole('combobox', { name: '설비' });
      await waitFor(() => expect((select as HTMLButtonElement).disabled).toBe(false));
      const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
      try {
        select.focus();
        fireEvent.keyDown(select, { key: 'ArrowDown' });
        fireEvent.click(await screen.findByRole('option', { name: EQUIPMENT }));
        await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
        await act(async () => { refreshed.resolve(response('error', null)); await refreshed.promise; });
        await waitFor(() => expect(document.activeElement).toBe(retryButton()), { timeout: 1000 });
      } finally {
        if (descriptor) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', descriptor);
        else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
      }
    });
    it('holds focus on the status row while retrying, then on the retry action after another failure', async () => {
      const { retries } = await failedThenRetry();
      expect(document.activeElement).toBe(screen.getByText('설비 목록을 불러오는 중…'));
      await act(async () => { retries[0]!.resolve(response('error', null)); await retries[0]!.promise; });
      await waitFor(() => expect(document.activeElement).toBe(retryButton()));
    });
    it('moves focus to the select when the retry succeeds', async () => {
      const { retries } = await failedThenRetry();
      await act(async () => { retries[0]!.resolve(ok({ options })); await retries[0]!.promise; });
      const select = screen.getByRole('combobox', { name: '설비' });
      await waitFor(() => expect(document.activeElement).toBe(select));
    });
    it('leaves focus on a control the user moved to while the list loads', async () => {
      const { retries } = await failedThenRetry();
      const other = document.createElement('button');
      document.body.append(other);
      try {
        other.focus();
        await act(async () => { retries[0]!.resolve(ok({ options })); await retries[0]!.promise; });
        await waitFor(() => expect((screen.getByRole('combobox', { name: '설비' }) as HTMLButtonElement).disabled).toBe(false));
        expect(document.activeElement).toBe(other);
      } finally {
        other.remove();
      }
    });
  });
  it('returns focus to the trigger when applying removes the data-window action', async () => {
    const { fake, setTime } = renderBar(ok({ options }), { from: '2026-01-02T10:00:00', to: '2026-01-02T10:30:00' });
    setTime.mockImplementation(range => fake.setContext(range));
    const select = await screen.findByRole('combobox', { name: '설비' });
    const apply = await screen.findByRole('button', { name: '이 구간 보기' });
    apply.focus();
    fireEvent.click(apply);
    await waitFor(() => expect(screen.queryByRole('button', { name: '이 구간 보기' })).toBeNull());
    expect(document.activeElement).toBe(select);
  });
  it('reserves the data-window action space after the window is applied', async () => {
    const { fake } = renderBar(ok({ options }), { from: '2026-01-02T10:00:00', to: '2026-01-02T10:30:00' });
    const apply = await screen.findByRole('button', { name: '이 구간 보기' });
    fake.setContext(HOST_TIME);
    expect(apply.isConnected).toBe(true);
    expect(apply.getAttribute('aria-hidden')).toBe('true');
    expect(apply.classList.contains('invisible')).toBe(true);
    expect((apply as HTMLButtonElement).disabled).toBe(true);
    expect(apply.tabIndex).toBe(-1);
  });
  it('recovers a failed list by retrying only discovery and enables selection', async () => {
    const retry = deferred<ApiResponse<unknown>>();
    let attempts = 0;
    const fake = hostFor({ page: {}, query: call => call.id === optionsId
      ? ++attempts === 1 ? Promise.resolve(response('error', null)) : retry.promise
      : server()(call) });
    const Screen = eqvScreens.topview;
    render(<Screen host={fake.host} params={{}} />);
    await screen.findByText('설비 목록을 불러오지 못했습니다');
    expect((screen.getByRole('combobox', { name: '설비' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText('위에서 설비를 고르세요')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    await screen.findByText('설비 목록을 불러오는 중…');
    await act(async () => { retry.resolve(ok({ options })); await retry.promise; });
    await waitFor(() => expect((screen.getByRole('combobox', { name: '설비' }) as HTMLButtonElement).disabled).toBe(false));
    screen.getByText('위에서 설비를 고르세요');
    expect(fake.log.queries.map(call => call.id)).toEqual([optionsId, optionsId]);
    expect(fake.log.statuses).toEqual([]);
  });
  it.each([
    ['2026-01-02T10:00:00', '2026-01-02T10:30:00'],
    ['2025-12-31T10:30:00', '2026-01-01T10:30:00'],
  ])('recovers an outside or 24h window (%s to %s) through setTime', async (from, to) => {
    const { setTime } = renderBar(ok({ options }), { from, to });
    await screen.findByText('데이터 구간 2026-01-01 10:00:00 ~ 2026-01-01 10:30:00');
    fireEvent.click(await screen.findByRole('button', { name: '이 구간 보기' }));
    expect(setTime).toHaveBeenCalledWith(HOST_TIME);
  });
  it('shows the window without an action when the applied window is already inside it', async () => {
    renderBar();
    await screen.findByText(/데이터 구간/);
    expect(screen.queryByRole('button', { name: '이 구간 보기' })).toBeNull();
  });
  it('applies the last eight hours of a longer data window and explains the clamp', async () => {
    const dataRange = { from: '2026-01-01T00:00:00', to: '2026-01-02T10:00:00' };
    const { setTime } = renderBar(ok({ options: [{ ...options[0], dataRange }] }), { from: '2026-01-01T00:00:00', to: '2026-01-02T10:00:00' });
    await screen.findByText(/마지막 8시간/);
    fireEvent.click(screen.getByRole('button', { name: '이 구간 보기' }));
    expect(setTime).toHaveBeenCalledWith({ from: '2026-01-02T02:00:00', to: '2026-01-02T10:00:00' });
  });
  it('explains the context bar fallback without setTime', async () => {
    renderBar(ok({ options }), { from: '2026-01-02T10:00:00', to: '2026-01-02T11:00:00' }, EQUIPMENT, false);
    await screen.findByText(/컨텍스트 바에서/);
    expect(screen.queryByRole('button', { name: '이 구간 보기' })).toBeNull();
  });
  it('does not invent a window for an equipment with no data', async () => {
    renderBar(ok({ options }), HOST_TIME, 'eq-synth-02');
    await screen.findByText('이 설비에는 표시할 데이터 구간이 없습니다');
    expect(screen.queryByRole('button', { name: '이 구간 보기' })).toBeNull();
  });
  it('keeps list loading local to the bar', async () => {
    renderBar(new Promise(() => undefined), HOST_TIME, null);
    screen.getByText('설비 목록을 불러오는 중…');
    screen.getByText('위에서 설비를 고르세요');
  });
  it.each([
    [response('error', null), '설비 목록을 불러오지 못했습니다'],
    [response('forbidden', null), '설비 목록 접근 권한이 필요합니다'],
    [response('empty', null), '등록된 설비가 없습니다'],
    [ok({ options: [] }), '등록된 설비가 없습니다'],
  ])('shows a list outcome locally (%j)', async (answer, copy) => {
    const { fake } = renderBar(answer, HOST_TIME, null);
    await screen.findByText(copy);
    screen.getByText(answer.outcome === 'error' ? '설비 목록을 다시 불러오세요' : '위에서 설비를 고르세요');
    expect(fake.log.statuses).toEqual([]);
  });
});
