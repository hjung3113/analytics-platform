import { act, cleanup, configure, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ApiResponse } from '@ap/contracts';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { FocusScreen } from '../src/screens/FocusScreen.js';
import { TopViewScreen } from '../src/screens/TopViewScreen.js';
import { assessments, createFake, deferred, ok, response, type FakeOptions, type QueryCall } from './test-support.js';
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
const OPTIONS_ID = 'eqv.equipment-options';
const SCREENS = [['topview', TopViewScreen], ['focus', FocusScreen]] as const;
const PATHS = { topview: '/tools/eqv-topview', focus: '/tools/eqv-focus' } as const;

/** A healthy server: the context, then the events in two pages. */
const server = (overrides: { context?: ApiResponse<unknown>; events?: (token: string | undefined) => ApiResponse<unknown> } = {}) => async ({ id, params }: QueryCall) => {
  if (id === CONTEXT_ID) return overrides.context ?? ok(contextData());
  const token = (params as { continuationToken?: string }).continuationToken;
  const [first, second] = pages();
  return overrides.events?.(token) ?? (token === undefined ? ok(first) : ok(second));
};
const fakeFor = (name: keyof typeof PATHS, options: Partial<FakeOptions> = {}) => createFake({
  path: PATHS[name], page: { equipment: EQUIPMENT }, context: HOST_TIME, query: server(), ...options,
});
/** The equipment list declares no assessment kinds. */
const listOk = (data: unknown) => ok(data, []);
const row = (id: string) => document.querySelector(`tr[data-occurrence-id="${id}"]`);
const drawn = () => document.querySelector('tr[data-occurrence-id], [data-layer="replay"]');

describe('queries', () => {
  it('asks only the two declared endpoints, projects the applied window, follows continuation pages in server order and aborts on leaving', async () => {
    const fake = fakeFor('focus');
    const view = fake.render(FocusScreen);
    await waitFor(() => expect(row('occ-open')).not.toBeNull());
    expect(fake.log.queries.map(({ id, params }) => [id, params])).toEqual([
      [CONTEXT_ID, { equipmentId: EQUIPMENT }],
      [EVENTS_ID, { equipmentId: EQUIPMENT }],
      [EVENTS_ID, { equipmentId: EQUIPMENT, continuationToken: 'p2' }],
    ]);
    expect(fake.log.queries[0]?.context).toMatchObject({ from: HOST_TIME.from, to: HOST_TIME.to });
    // Both pages are in one batch: a row from the first page and one from the last.
    expect(row('occ-carrier')).not.toBeNull();
    view.unmount();
    // A load that was already done has nothing to abort; the signal of a read left pending does (see load races).
    expect(fake.log.queries).toHaveLength(3);
  });
});

describe('states that need the user', () => {
  it.each(SCREENS)('%s: no equipment asks for one and does not query replay', async (name, Screen) => {
    const fake = fakeFor(name, { page: {}, query: async (call) => call.id === OPTIONS_ID ? listOk({ options: [] }) : server()(call) });
    fake.render(Screen);
    screen.getByText(name === 'topview' ? '위에서 설비를 고르세요' : 'Top View에서 설비를 고르세요');
    await waitFor(() => expect(fake.log.queries.map(call => call.id)).toEqual(name === 'topview' ? [OPTIONS_ID] : []));
  });
});

describe('load races', () => {
  it.each(SCREENS)('%s: a new equipment aborts the in-flight load and its late response is not shown', async (name, Screen) => {
    const late = deferred<ApiResponse<unknown>>();
    const fake = fakeFor(name, {
      page: { equipment: 'eq-slow' },
      query: async (call) => {
        if (call.id === CONTEXT_ID && (call.params as { equipmentId: string }).equipmentId === 'eq-slow') return await late.promise;
        if (call.id === OPTIONS_ID) return listOk({ options: [] });
        return await server()(call);
      },
    });
    fake.render(Screen);
    await waitFor(() => expect(fake.log.queries.filter(call => call.id === CONTEXT_ID)).toHaveLength(1));
    const first = fake.log.queries.find(call => call.id === CONTEXT_ID)!;
    fake.setPage({ equipment: EQUIPMENT });
    await waitFor(() => expect(first.signal?.aborted).toBe(true));
    await waitFor(() => expect(drawn()).not.toBeNull());
    await act(async () => { late.resolve(response('error', null, { message: 'stale frame' })); await late.promise; });
    expect(screen.queryByText(/stale frame/)).toBeNull();
  });
});

describe('request generations', () => {
  it.each(SCREENS)('%s: restoring an earlier equipment waits for a new response instead of reviving the old result', async (name, Screen) => {
    const late = deferred<ApiResponse<unknown>>();
    let calls = 0;
    const fake = fakeFor(name, {
      query: async (call) => {
        if (call.id === OPTIONS_ID) return listOk({ options: [] });
        if (call.id === CONTEXT_ID && ++calls === 2) return await late.promise;
        return await server()(call);
      },
    });
    fake.render(Screen);
    await waitFor(() => expect(drawn()).not.toBeNull());
    fake.setPage({ equipment: null });
    await screen.findByText(name === 'topview' ? '위에서 설비를 고르세요' : 'Top View에서 설비를 고르세요');
    fake.setPage({ equipment: EQUIPMENT });
    await waitFor(() => expect(calls).toBe(2));
    expect(screen.queryByRole('status', { busy: true })).not.toBeNull();
    expect(drawn()).toBeNull();
    await act(async () => { late.resolve(ok(contextData())); await late.promise; });
    await waitFor(() => expect(drawn()).not.toBeNull());
  });

  it.each(SCREENS)('%s: A → B → A with B unsettled does not show the first A result', async (name, Screen) => {
    const slowB = deferred<ApiResponse<unknown>>();
    let aCalls = 0;
    const fake = fakeFor(name, {
      query: async (call) => {
        if (call.id === OPTIONS_ID) return listOk({ options: [] });
        const equipmentId = (call.params as { equipmentId: string }).equipmentId;
        if (call.id === CONTEXT_ID && equipmentId === 'eq-b') return await slowB.promise;
        if (call.id === CONTEXT_ID && ++aCalls === 2) return await new Promise<never>(() => undefined);
        return await server()(call);
      },
    });
    fake.render(Screen);
    await waitFor(() => expect(drawn()).not.toBeNull());
    fake.setPage({ equipment: 'eq-b' });
    await waitFor(() => expect(screen.queryByRole('status', { busy: true })).not.toBeNull());
    fake.setPage({ equipment: EQUIPMENT });
    await waitFor(() => expect(aCalls).toBe(2));
    expect(screen.queryByRole('status', { busy: true })).not.toBeNull();
    expect(drawn()).toBeNull();
  });
});

describe('server generation (session, Kernel revision, adapter)', () => {
  const CHANGES = [
    ['a user switch', (fake: ReturnType<typeof fakeFor>) => fake.switchUser('u2')],
    ['a revision change', (fake: ReturnType<typeof fakeFor>) => fake.bumpRevision()],
    ['an adapter swap', (fake: ReturnType<typeof fakeFor>) => fake.swapAdapter()],
  ] as const;
  const cases = SCREENS.flatMap(([name, Screen]) => CHANGES.map(([change, run]) => [name, change, Screen, run] as const));

  it.each(cases)('%s: settled data is hidden at once after %s and the same equipment and time are read again', async (name, _change, Screen, run) => {
    const late = deferred<ApiResponse<unknown>>();
    let calls = 0;
    const fake = fakeFor(name, { query: async (call) => call.id === OPTIONS_ID ? listOk({ options: [] }) : call.id === CONTEXT_ID && ++calls === 2 ? await late.promise : await server()(call) });
    fake.render(Screen);
    await waitFor(() => expect(drawn()).not.toBeNull());
    const url = fake.url();
    await run(fake);
    expect(drawn()).toBeNull();
    await waitFor(() => expect(calls).toBe(2));
    expect(screen.queryByRole('status', { busy: true })).not.toBeNull();
    await act(async () => { late.resolve(ok(contextData())); await late.promise; });
    await waitFor(() => expect(drawn()).not.toBeNull());
    expect(fake.url()).toBe(url);
  });

  it.each(cases)('%s: a pending request is aborted by %s and its late reply is not shown', async (name, _change, Screen, run) => {
    const late = deferred<ApiResponse<unknown>>();
    let calls = 0;
    const fake = fakeFor(name, { query: async (call) => call.id === OPTIONS_ID ? listOk({ options: [] }) : call.id === CONTEXT_ID && ++calls === 1 ? await late.promise : await server()(call) });
    fake.render(Screen);
    await waitFor(() => expect(calls).toBe(1));
    const first = fake.log.queries.find(call => call.id === CONTEXT_ID)!;
    await run(fake);
    await waitFor(() => expect(first.signal?.aborted).toBe(true));
    await waitFor(() => expect(drawn()).not.toBeNull());
    await act(async () => { late.resolve(response('error', null, { message: 'stale frame' })); await late.promise; });
    expect(screen.queryByText(/stale frame/)).toBeNull();
    expect(drawn()).not.toBeNull();
  });
});

describe('outcomes', () => {
  const failing = (outcome: ApiResponse<unknown>['outcome']) => fakeFor('topview', { query: async (call) => call.id === OPTIONS_ID ? listOk({ options: [] }) : server({ context: response(outcome, null, { message: `${outcome}-text` }) })(call) });

  it.each([
    ['error', '불러오지 못했습니다', /error-text/],
    ['timeout', '응답 시간 초과', /서버가 제때 응답하지 않았습니다/],
    ['too_large', '구간이 너무 큽니다', /최대 8시간까지.*기간을 8시간 이하로 줄이세요/],
  ] as const)('%s is a screen-local state with the message and the response\'s correlation id', async (outcome, title, message) => {
    const fake = failing(outcome);
    fake.render(TopViewScreen);
    await screen.findByText(title);
    screen.getByText(message);
    if (outcome !== 'error') expect(screen.queryByText(new RegExp(`${outcome}-text`))).toBeNull();
    screen.getByText(/corr-1/);
  });

  it('empty shows the empty state', async () => {
    const fake = fakeFor('topview', { query: async (call) => call.id === OPTIONS_ID ? listOk({ options: [] }) : server({ context: response('empty', null) })(call) });
    fake.render(TopViewScreen);
    await screen.findByText('이 구간에 표시할 Occurrence가 없습니다');
  });

  it('forbidden shows its own access state; the next equipment the server answers shows the data', async () => {
    const fake = fakeFor('focus', {
      page: { equipment: 'eq-denied' },
      query: async (call) => (call.params as { equipmentId: string }).equipmentId === EQUIPMENT ? await server()(call) : response('forbidden', null),
    });
    fake.render(FocusScreen);
    await screen.findByText('접근 권한이 필요합니다');
    fake.setPage({ equipment: EQUIPMENT });
    await waitFor(() => expect(row('occ-open')).not.toBeNull());
    expect(screen.queryByText('접근 권한이 필요합니다')).toBeNull();
    expect(screen.queryByText('데이터 오류')).toBeNull();
  });

  it.each(SCREENS)('%s: Retry on forbidden re-requests the same equipment and time and shows the data; the address does not change', async (name, Screen) => {
    let denied = true;
    const fake = fakeFor(name, { query: async (call) => call.id === OPTIONS_ID ? listOk({ options: [] }) : denied ? response('forbidden', null) : await server()(call) });
    fake.render(Screen);
    await screen.findByText('접근 권한이 필요합니다');
    const before = fake.url();
    const first = fake.log.queries.filter(call => call.id === CONTEXT_ID);
    denied = false;
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(drawn()).not.toBeNull());
    expect(screen.queryByText('접근 권한이 필요합니다')).toBeNull();
    expect(fake.url()).toBe(before);
    const again = fake.log.queries.filter(call => call.id === CONTEXT_ID);
    expect(again.length).toBeGreaterThan(first.length);
    expect(again.at(-1)?.params).toEqual({ equipmentId: EQUIPMENT });
    expect(again.at(-1)?.context).toMatchObject({ from: HOST_TIME.from, to: HOST_TIME.to });
  });

  it.each(SCREENS)('%s: non-clear assessments become one Data Trust line, not stacked notices; unknown is not worded as clear', async (name, Screen) => {
    const notClear = assessments({ coverage: { kind: 'coverage', state: 'unknown', reason: 'check_failed' }, collection: { kind: 'collection', state: 'confirmed' } });
    const fake = fakeFor(name, { query: async (call) => call.id === OPTIONS_ID ? listOk({ options: [] }) : server({ events: (token) => ok(token === undefined ? pages()[0] : pages()[1], notClear) })(call) });
    fake.render(Screen);
    await waitFor(() => expect(drawn()).not.toBeNull());
    screen.getByTitle(/확인된 이슈 1건/);
    expect(screen.queryByText(/문제가 확인되었습니다|이상 없음이 아닙니다/)).toBeNull();
    expect(screen.queryByTitle(/확인된 이슈 없음/)).toBeNull();
  });

  it('only unknown assessments say some status could not be confirmed, never «no issues»', async () => {
    const unknown = assessments({ coverage: { kind: 'coverage', state: 'unknown', reason: 'source_unavailable' } });
    const fake = fakeFor('focus', { query: server({ events: (token) => ok(token === undefined ? pages()[0] : pages()[1], unknown) }) });
    fake.render(FocusScreen);
    await screen.findByTitle(/일부 상태를 확인하지 못했습니다 \(1\)/);
    expect(screen.queryByTitle(/확인된 이슈 없음/)).toBeNull();
  });

  it('empty and failed reads keep the Data Trust line above their state', async () => {
    const unknown = assessments({ coverage: { kind: 'coverage', state: 'unknown' } });
    const fake = fakeFor('focus', { query: server({ context: response('empty', null, { assessments: unknown }) }) });
    fake.render(FocusScreen);
    await screen.findByText('이 구간에 표시할 Occurrence가 없습니다');
    screen.getByTitle(/일부 상태를 확인하지 못했습니다 \(1\)/);
  });

  it.each(SCREENS)('%s: a tampered Mapping Version is an error state, not a partial replay', async (name, Screen) => {
    const tampered = { ...mappings[0]!, entries: mappings[0]!.entries.slice(0, -1) };
    const fake = fakeFor(name, { query: async (call) => call.id === OPTIONS_ID ? listOk({ options: [] }) : server({ context: ok({ ...contextData(), mappings: [tampered, mappings[1]!] }) })(call) });
    fake.render(Screen);
    await screen.findByText('데이터 오류');
    screen.getByText(/내용 hash가 맞지 않습니다/);
    expect(document.querySelector('tr[data-occurrence-id]')).toBeNull();
  });

  it.each(SCREENS)('%s: two Bindings sharing a Mapping hash but naming different valid Layouts are a data error', async (name, Screen) => {
    const [first] = bindings.bindings;
    const other = { ...layout, id: 'eq-synth-01-layout-b' };
    const twin = { ...bindings, bindings: [first!, { ...first!, layoutId: other.id, effectiveFrom: '2026-01-01T10:04:30.000' }] };
    const fake = fakeFor(name, { query: async (call) => call.id === OPTIONS_ID ? listOk({ options: [] }) : server({ context: ok({ layouts: [layout, other], bindings: twin, mappings }) })(call) });
    fake.render(Screen);
    await screen.findByText('데이터 오류');
    screen.getByText(/layoutId/);
    expect(document.querySelector('tr[data-occurrence-id]')).toBeNull();
  });
});

describe('Focus detail', () => {
  const openDetail = async () => {
    await waitFor(() => expect(row('occ-pm1-process')).not.toBeNull());
    fireEvent.click(row('occ-pm1-process')!);
    return await screen.findByRole('dialog');
  };

  it('selecting an Occurrence shows its evidence in the DetailDrawer, labelled by the Occurrence, and there is no inline tab', async () => {
    const fake = fakeFor('focus');
    fake.render(FocusScreen);
    expect(screen.queryByRole('tab', { name: '근거 상세' })).toBeNull();
    const dialog = await openDetail();
    within(dialog).getByText('근거 상세 · occ-pm1-process');
    await within(dialog).findByRole('region', { name: '근거 상세 occ-pm1-process' });
    expect(screen.queryByRole('tab', { name: '근거 상세' })).toBeNull();
  });

  it('the drawer closes on its close button', async () => {
    const fake = fakeFor('focus');
    fake.render(FocusScreen);
    const dialog = await openDetail();
    fireEvent.click(within(dialog).getByRole('button', { name: '상세 닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('the drawer closes on an equipment change', async () => {
    const fake = fakeFor('focus');
    fake.render(FocusScreen);
    await openDetail();
    fake.setPage({ equipment: 'eq-synth-02' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('the drawer closes on unmount', async () => {
    const fake = fakeFor('focus');
    const view = fake.render(FocusScreen);
    await openDetail();
    view.unmount();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('the drawer closes when the applied time changes', async () => {
    const fake = fakeFor('focus');
    fake.render(FocusScreen);
    await openDetail();
    fake.setTime({ from: '2026-01-02T10:00:00', to: '2026-01-02T11:00:00' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('Top View로 navigates to the topview menu with the equipment', async () => {
    const fake = fakeFor('focus');
    fake.render(FocusScreen);
    fireEvent.click(await screen.findByRole('button', { name: 'Top View로' }));
    await waitFor(() => expect(window.location.pathname).toBe('/tools/eqv-topview'));
    expect(fake.page('equipment')).toBe(EQUIPMENT);
  });
});

describe('Top View', () => {
  const opened = () => ({ path: window.location.pathname, equipment: new URLSearchParams(window.location.search).get('equipment'), entityType: new URLSearchParams(window.location.search).get('entityType'), anchor: new URLSearchParams(window.location.search).get('anchor') });

  it('shows the layout with the scene state as of the padded end of the window, and opens Focus', async () => {
    const fake = fakeFor('topview');
    fake.render(TopViewScreen);
    await screen.findAllByText('2026-01-01 10:30:00');
    expect(document.querySelector('[data-layer="replay"]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Focus 열기' }));
    await waitFor(() => expect(opened()).toEqual({ path: '/tools/eqv-focus', equipment: EQUIPMENT, entityType: 'job', anchor: '58' }));
  });

  it.each([
    [null, '1'],
    ['pm-b', '19'],
    ['pm-a', '18'],
  ] as const)('Focus 열기 at 10:08:30 with %s selected opens Focus on that Component\'s open Occurrence (its RecordSequence), else the first one open at the cursor', async (id, anchor) => {
    const fake = fakeFor('topview', { context: { from: HOST_TIME.from, to: '2026-01-01T10:08:30' } });
    fake.render(TopViewScreen);
    await screen.findAllByText('2026-01-01 10:08:30');
    if (id !== null) fireEvent.click(document.querySelector(`[data-component-id="${id}"]`)!);
    fireEvent.click(screen.getByRole('button', { name: 'Focus 열기' }));
    await waitFor(() => expect(opened()).toEqual({ path: '/tools/eqv-focus', equipment: EQUIPMENT, entityType: 'job', anchor }));
  });

  const openComponent = async (id: string) => {
    await screen.findAllByText('2026-01-01 10:30:00');
    fireEvent.click(document.querySelector(`[data-component-id="${id}"]`)!);
    return await screen.findByRole('dialog');
  };

  it('selecting a Component shows its detail in the DetailDrawer, not in an inline panel', async () => {
    const fake = fakeFor('topview');
    fake.render(TopViewScreen);
    const dialog = await openComponent('pm-a');
    within(dialog).getByText('Component · pm-a');
    within(dialog).getByRole('region', { name: 'Component 상세 pm-a' });
    expect(screen.queryByText('Component를 선택하세요')).toBeNull();
  });

  it('the drawer closes on its close button', async () => {
    const fake = fakeFor('topview');
    fake.render(TopViewScreen);
    const dialog = await openComponent('pm-a');
    fireEvent.click(within(dialog).getByRole('button', { name: '상세 닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('the drawer closes on an equipment change', async () => {
    const fake = fakeFor('topview');
    fake.render(TopViewScreen);
    await openComponent('pm-a');
    fake.setPage({ equipment: 'eq-synth-02' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('the drawer closes on unmount', async () => {
    const fake = fakeFor('topview');
    const view = fake.render(TopViewScreen);
    await openComponent('pm-a');
    view.unmount();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('the drawer closes when the applied time changes', async () => {
    const fake = fakeFor('topview');
    fake.render(TopViewScreen);
    await openComponent('pm-a');
    fake.setTime({ from: '2026-01-02T10:00:00', to: '2026-01-02T11:00:00' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('shows one Data Trust line for non-clear assessments above the board', async () => {
    const notClear = assessments({ processing_delay: { kind: 'processing_delay', state: 'confirmed', detail: '15분 지연' } });
    const fake = fakeFor('topview', { query: async (call) => call.id === OPTIONS_ID ? listOk({ options: [] }) : server({ events: (token) => ok(token === undefined ? pages()[0] : pages()[1], notClear) })(call) });
    fake.render(TopViewScreen);
    await screen.findAllByText('2026-01-01 10:30:00');
    expect(screen.getAllByTitle(/확인된 이슈 1건/)).toHaveLength(1);
  });
});

describe('Top View Component detail words', () => {
  it.each([
    ['pm-b', /처리 중/],
    ['pm-a', /기록된 활동 없음/],
  ] as const)('%s shows the activity in Korean with its evidence badge', async (id, words) => {
    const fake = fakeFor('topview');
    fake.render(TopViewScreen);
    await screen.findAllByText('2026-01-01 10:30:00');
    fireEvent.click(document.querySelector(`[data-component-id="${id}"]`)!);
    const region = await screen.findByRole('region', { name: `Component 상세 ${id}` });
    expect(region.textContent).toMatch(words);
    expect(region.textContent).not.toMatch(/processing|no recorded activity/);
    expect(region.textContent).toMatch(/활동 근거/);
  });
});

describe('Focus 재생 구간 in the page keys', () => {
  const rangeInputs = () => [screen.getByLabelText('시작'), screen.getByLabelText('끝')] as HTMLInputElement[];
  const SAVED = { equipment: EQUIPMENT, rangeFrom: '2026-01-01T10:05:00.000', rangeTo: '2026-01-01T10:12:00.000' };

  it('applying a range writes rangeFrom/rangeTo to the address, and a remount reads the range back', async () => {
    const fake = fakeFor('focus');
    const first = fake.render(FocusScreen);
    await screen.findByRole('form', { name: '구간' });
    const [from, to] = rangeInputs();
    fireEvent.change(from!, { target: { value: '2026-01-01T10:05:00.000' } });
    fireEvent.change(to!, { target: { value: '2026-01-01T10:12:00.000' } });
    fireEvent.submit(screen.getByRole('form', { name: '구간' }));
    await waitFor(() => expect([fake.page('rangeFrom'), fake.page('rangeTo')]).toEqual(['2026-01-01T10:05:00.000', '2026-01-01T10:12:00.000']));
    first.unmount();
    fake.render(FocusScreen);
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
    const fake = fakeFor('focus', { page: { equipment: EQUIPMENT, rangeFrom, ...(rangeTo === null ? {} : { rangeTo }) } });
    fake.render(FocusScreen);
    await screen.findByRole('form', { name: '구간' });
    expect(rangeInputs().map((input) => input.value)).not.toContain(rangeFrom);
  });

  it('a saved range survives a refresh of the same equipment, time and entry', async () => {
    const fake = fakeFor('focus', { page: SAVED });
    fake.render(FocusScreen);
    await screen.findByRole('form', { name: '구간' });
    fake.setPage({ entityType: null });
    expect(rangeInputs().map((input) => input.value)).toEqual(['2026-01-01T10:05:00.000', '2026-01-01T10:12:00.000']);
    expect(fake.page('rangeFrom')).toBe('2026-01-01T10:05:00.000');
  });

  it.each([
    ['applied time', (fake: ReturnType<typeof fakeFor>) => fake.setTime({ from: '2026-01-02T10:00:00', to: '2026-01-02T11:00:00' })],
    ['equipment', (fake: ReturnType<typeof fakeFor>) => fake.setPage({ equipment: 'other-tool' })],
    ['entry anchor', (fake: ReturnType<typeof fakeFor>) => fake.setPage({ entityType: 'occurrence', anchor: 'occ-pm1-process' })],
  ] as const)('a saved range is dropped when the %s changes', async (_name, change) => {
    const fake = fakeFor('focus', { page: SAVED });
    fake.render(FocusScreen);
    await screen.findByRole('form', { name: '구간' });
    change(fake);
    await waitFor(() => expect(fake.page('rangeFrom')).toBeNull());
    expect(fake.page('rangeTo')).toBeNull();
  });
});

describe('Korean copy', () => {
  it.each([
    ['topview', TopViewScreen, '2026-01-01 10:30:00'],
    ['focus', FocusScreen, '2026-01-01 10:'],
  ] as const)('%s: times read YYYY-MM-DD HH:mm:ss and no control keeps an English label', async (name, Screen, shown) => {
    const fake = fakeFor(name);
    fake.render(Screen);
    await waitFor(() => expect(document.querySelector('table, [data-layer="replay"]')).not.toBeNull());
    const text = document.body.textContent ?? '';
    expect(text).toContain(shown);
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    expect(text).not.toMatch(/Sequence step|이전 record|다음 record/);
  });

  it('the evidence detail names its provenance rows in Korean (Ruleset Version stays a glossary term)', async () => {
    const fake = fakeFor('focus');
    fake.render(FocusScreen);
    await waitFor(() => expect(row('occ-pm1-process')).not.toBeNull());
    fireEvent.click(row('occ-pm1-process')!);
    const detail = await screen.findByRole('region', { name: '근거 상세 occ-pm1-process' });
    for (const label of ['합성 데이터', 'Mapping Version', 'Ruleset Version']) expect(within(detail).getByText(label)).toBeTruthy();
    expect(within(detail).queryByText('synthetic')).toBeNull();
  });
});

describe('Top View equipment bar (#1644)', () => {
  const options = [{ id: EQUIPMENT, label: EQUIPMENT, dataRange: HOST_TIME }, { id: 'eq-synth-02', label: 'eq-synth-02', dataRange: null }];
  const renderBar = (answer: ApiResponse<unknown> | Promise<ApiResponse<unknown>> = listOk({ options }), context: FakeOptions['context'] = HOST_TIME, chosen: string | null = EQUIPMENT) => {
    const fake = fakeFor('topview', { page: chosen ? { equipment: chosen } : {}, context, query: call => call.id === OPTIONS_ID ? Promise.resolve(answer) : server()(call) });
    fake.render(TopViewScreen);
    return fake;
  };
  // jsdom has no scrolling API; the real Radix Select scrolls its focused option.
  const withScrollIntoView = async (run: () => Promise<void>) => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
    try {
      await run();
    } finally {
      if (descriptor) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', descriptor);
      else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
    }
  };

  it('offers a labelled selector without equipment and writes the selected page key', async () => {
    const fake = renderBar(listOk({ options }), HOST_TIME, null);
    screen.getByText('위에서 설비를 고르세요');
    const select = await screen.findByRole('combobox', { name: '설비' });
    await waitFor(() => expect((select as HTMLButtonElement).disabled).toBe(false));
    await withScrollIntoView(async () => {
      fireEvent.keyDown(select, { key: 'ArrowDown' });
      fireEvent.click(await screen.findByRole('option', { name: EQUIPMENT }));
      await waitFor(() => expect(fake.page('equipment')).toBe(EQUIPMENT));
      await screen.findAllByText('2026-01-01 10:30:00');
    });
  });

  it('keeps the same focused trigger through selection and the ready board', async () => {
    renderBar(listOk({ options }), HOST_TIME, null);
    const select = await screen.findByRole('combobox', { name: '설비' });
    await waitFor(() => expect((select as HTMLButtonElement).disabled).toBe(false));
    await withScrollIntoView(async () => {
      select.focus();
      fireEvent.keyDown(select, { key: 'ArrowDown' });
      fireEvent.click(await screen.findByRole('option', { name: EQUIPMENT }));
      await screen.findAllByText('2026-01-01 10:30:00');
      expect(screen.getByRole('combobox', { name: '설비' })).toBe(select);
      await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
      await waitFor(() => expect(document.activeElement).toBe(select), { timeout: 1000 });
      expect((select as HTMLButtonElement).disabled).toBe(false);
    });
  });

  describe('focus through list failure and retry', () => {
    const retryButton = () => screen.getByRole('button', { name: '다시 시도' });
    // #1751 diagnostics: the status-row focus check failed once in CI (focus on <body>) and never locally. A failure prints
    // the focus moves since the retry, the focused element and the list request state so a recurrence names its cause.
    const describeNode = (node: EventTarget | null) => {
      if (!(node instanceof Element)) return node === null ? 'null' : String(node);
      const role = node.getAttribute('role');
      return `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}${role ? `[role=${role}]` : ''}${node.isConnected ? '' : '(detached)'} "${(node.textContent ?? '').slice(0, 30)}"`;
    };
    const failedThenRetry = async () => {
      const retries: Array<ReturnType<typeof deferred<ApiResponse<unknown>>>> = [];
      let attempts = 0;
      let settled = 0;
      const fake = fakeFor('topview', { page: {}, query: call => {
        if (call.id !== OPTIONS_ID) return server()(call);
        if (++attempts === 1) { settled += 1; return Promise.resolve(response('error', null, { assessments: [] })); }
        const next = deferred<ApiResponse<unknown>>();
        retries.push(next);
        return next.promise.finally(() => { settled += 1; });
      } });
      fake.render(TopViewScreen);
      await screen.findByText('설비 목록을 불러오지 못했습니다');
      const trace: string[] = [];
      const record = (event: FocusEvent) => trace.push(`${event.type} ${describeNode(event.target)} -> related ${describeNode(event.relatedTarget)}`);
      document.addEventListener('focusin', record);
      document.addEventListener('focusout', record);
      onTestFinished(() => { document.removeEventListener('focusin', record); document.removeEventListener('focusout', record); });
      retryButton().focus();
      fireEvent.click(retryButton());
      await screen.findByText('설비 목록을 불러오는 중…');
      const diagnose = () => [
        `activeElement: ${describeNode(document.activeElement)}`,
        `list requests: started ${attempts}, settled ${settled} (fetching: ${attempts > settled})`,
        `bar: loading row ${screen.queryByText('설비 목록을 불러오는 중…') ? 'shown' : 'absent'}, retry action ${screen.queryByRole('button', { name: '다시 시도' }) ? 'shown' : 'absent'}`,
        'focus moves since the retry:', ...trace.map(line => `  ${line}`),
      ].join('\n');
      return { retries, diagnose };
    };
    it('holds focus on the status row while retrying, then on the retry action after another failure', async () => {
      const { retries, diagnose } = await failedThenRetry();
      const row = screen.getByText('설비 목록을 불러오는 중…');
      expect(document.activeElement, document.activeElement === row ? undefined : diagnose()).toBe(row);
      await act(async () => { retries[0]!.resolve(response('error', null, { assessments: [] })); await retries[0]!.promise; });
      await waitFor(() => expect(document.activeElement).toBe(retryButton()));
    });
    it('moves focus to the select when the retry succeeds', async () => {
      const { retries } = await failedThenRetry();
      await act(async () => { retries[0]!.resolve(listOk({ options })); await retries[0]!.promise; });
      const select = screen.getByRole('combobox', { name: '설비' });
      await waitFor(() => expect(document.activeElement).toBe(select));
    });
    it('leaves focus on a control the user moved to while the list loads', async () => {
      const { retries } = await failedThenRetry();
      const other = document.createElement('button');
      document.body.append(other);
      try {
        other.focus();
        await act(async () => { retries[0]!.resolve(listOk({ options })); await retries[0]!.promise; });
        await waitFor(() => expect((screen.getByRole('combobox', { name: '설비' }) as HTMLButtonElement).disabled).toBe(false));
        expect(document.activeElement).toBe(other);
      } finally {
        other.remove();
      }
    });
  });

  it('returns focus to the trigger when applying removes the data-window action', async () => {
    renderBar(listOk({ options }), { from: '2026-01-02T10:00:00', to: '2026-01-02T10:30:00' });
    const select = await screen.findByRole('combobox', { name: '설비' });
    const apply = await screen.findByRole('button', { name: '이 구간 보기' });
    apply.focus();
    fireEvent.click(apply);
    await waitFor(() => expect(screen.queryByRole('button', { name: '이 구간 보기' })).toBeNull());
    expect(document.activeElement).toBe(select);
  });
  it('reserves the data-window action space after the window is applied', async () => {
    const fake = renderBar(listOk({ options }), { from: '2026-01-02T10:00:00', to: '2026-01-02T10:30:00' });
    const apply = await screen.findByRole('button', { name: '이 구간 보기' });
    fake.setTime(HOST_TIME);
    expect(apply.isConnected).toBe(true);
    expect(apply.getAttribute('aria-hidden')).toBe('true');
    expect(apply.classList.contains('invisible')).toBe(true);
    expect((apply as HTMLButtonElement).disabled).toBe(true);
    expect(apply.tabIndex).toBe(-1);
  });
  it('recovers a failed list by retrying only discovery and enables selection', async () => {
    const retry = deferred<ApiResponse<unknown>>();
    let attempts = 0;
    const fake = fakeFor('topview', { page: {}, query: call => call.id === OPTIONS_ID
      ? ++attempts === 1 ? Promise.resolve(response('error', null, { assessments: [] })) : retry.promise
      : server()(call) });
    fake.render(TopViewScreen);
    await screen.findByText('설비 목록을 불러오지 못했습니다');
    expect((screen.getByRole('combobox', { name: '설비' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText('위에서 설비를 고르세요')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    await screen.findByText('설비 목록을 불러오는 중…');
    await act(async () => { retry.resolve(listOk({ options })); await retry.promise; });
    await waitFor(() => expect((screen.getByRole('combobox', { name: '설비' }) as HTMLButtonElement).disabled).toBe(false));
    screen.getByText('위에서 설비를 고르세요');
    expect(fake.log.queries.map(call => call.id)).toEqual([OPTIONS_ID, OPTIONS_ID]);
  });
  it.each([
    ['2026-01-02T10:00:00', '2026-01-02T10:30:00'],
    ['2025-12-31T10:30:00', '2026-01-01T10:30:00'],
  ])('recovers an outside or 24h window (%s to %s) through the applied time', async (from, to) => {
    const fake = renderBar(listOk({ options }), { from, to });
    await screen.findByText('데이터 구간 2026-01-01 10:00:00 ~ 2026-01-01 10:30:00');
    fireEvent.click(await screen.findByRole('button', { name: '이 구간 보기' }));
    await waitFor(() => expect([fake.page('from'), fake.page('to')]).toEqual([HOST_TIME.from, HOST_TIME.to]));
  });
  it('shows the window without an action when the applied window is already inside it', async () => {
    renderBar();
    await screen.findByText(/데이터 구간/);
    expect(screen.queryByRole('button', { name: '이 구간 보기' })).toBeNull();
  });
  it('applies the last eight hours of a longer data window and explains the clamp', async () => {
    const dataRange = { from: '2026-01-01T00:00:00', to: '2026-01-02T10:00:00' };
    const fake = renderBar(listOk({ options: [{ ...options[0], dataRange }] }), { from: '2026-01-01T00:00:00', to: '2026-01-02T10:00:00' });
    await screen.findByText(/마지막 8시간/);
    fireEvent.click(screen.getByRole('button', { name: '이 구간 보기' }));
    await waitFor(() => expect([fake.page('from'), fake.page('to')]).toEqual(['2026-01-02T02:00:00', '2026-01-02T10:00:00']));
  });
  it('does not invent a window for an equipment with no data', async () => {
    renderBar(listOk({ options }), HOST_TIME, 'eq-synth-02');
    await screen.findByText('이 설비에는 표시할 데이터 구간이 없습니다');
    expect(screen.queryByRole('button', { name: '이 구간 보기' })).toBeNull();
  });
  it('keeps list loading local to the bar', async () => {
    renderBar(new Promise(() => undefined), HOST_TIME, null);
    screen.getByText('설비 목록을 불러오는 중…');
    screen.getByText('위에서 설비를 고르세요');
  });
  it.each([
    [response('error', null, { assessments: [] }), '설비 목록을 불러오지 못했습니다'],
    [response('forbidden', null), '설비 목록 접근 권한이 필요합니다'],
    [response('empty', null, { assessments: [] }), '등록된 설비가 없습니다'],
    [listOk({ options: [] }), '등록된 설비가 없습니다'],
  ])('shows a list outcome locally (%j)', async (answer, copy) => {
    renderBar(answer, HOST_TIME, null);
    await screen.findByText(copy);
    screen.getByText(answer.outcome === 'error' ? '설비 목록을 다시 불러오세요' : '위에서 설비를 고르세요');
  });
});
