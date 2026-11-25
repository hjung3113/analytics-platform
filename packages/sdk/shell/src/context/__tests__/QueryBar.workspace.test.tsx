import { useState, type ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { House } from 'lucide-react';
import { groupId, spaceId } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry, usePlatform, useQueryDraft } from '@ap/kernel';
import { createFakeSavedViewStore, memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { PanelAddMenu, PanelWorkspace, PageFilterBar, PlatformPage, StatCard, type PlatformPageProps } from '@ap/components';
import { GlobalContextBar } from '../GlobalContextBar';

const period = '?from=2026-09-25T09:00:00&to=2026-09-26T09:00:00';
const summary = [{ key: 'grain', label: '집계', value: '시간' }];
const features = { export: false, savedView: false, annotate: false, compare: false };
let draft: ReturnType<typeof useQueryDraft>;
function Parameters() {
  draft = useQueryDraft();
  const [text, setText] = useState('시간');
  return <PageFilterBar collapsible defaultCollapsed preferenceKey="parameters" label="페이지 조건" fields={[{ key: 'grain', kind: 'text', label: '집계', value: text, onValueChange: value => { setText(value); draft.setDraftPage({ grain: value }); } }]} summaryItems={summary} />;
}
function Workspace() {
  return <PanelWorkspace persistKey="main" initialPreset="default" label={{ ko: '작업 영역', en: 'Workspace' }} initialMode="fit"
    toolbarActions={<PanelAddMenu items={[{ id: 'extra', title: { ko: '추가 지표', en: 'Extra metric' } }]} onAdd={() => {}} />}
    presets={[
      { id: 'default', label: { ko: '기본', en: 'Default' }, layout: { type: 'group', panels: ['chart', 'stats'] } },
      { id: 'focus', label: { ko: '집중', en: 'Focus' }, layout: { type: 'group', panels: ['stats', 'chart'] } },
    ]} panels={[
      { id: 'chart', primary: true, title: { ko: '차트', en: 'Chart' }, render: () => <p>chart data</p> },
      { id: 'stats', title: { ko: '요약', en: 'Summary' }, render: () => <StatCard icon={House} label="지표" value="12" /> },
    ]} />;
}
const done = { status: 'done', completedAt: 1_800_000_000_000 } as const;
function mount({ result = done, expanded = false, pageType = 'analysis', apply = true, scopeGate = false, issues = false, notes = true, metadata = true, page, tools = false }: { result?: PlatformPageProps['queryResult']; expanded?: boolean; pageType?: 'analysis' | 'overview'; apply?: boolean; scopeGate?: boolean; issues?: boolean; notes?: boolean; metadata?: boolean; page?: ReactNode; tools?: boolean } = {}) {
  const menu = { id: 'home', primary: true, path: '/', group: groupId('overview'), label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, icon: House, permission: 'platform:view' as const, requiresScope: scopeGate, context: { ...noContext, time: 'apply' as const, condition: 'apply' as const }, conditionPresets: [{ id: 'eqp', label: { ko: '설비 기준', en: 'By equipment' }, axes: ['maker'] }, { id: 'org', label: { ko: '조직 기준', en: 'By organization' }, axes: ['team'] }], conditionPreset: { key: 'view', default: 'eqp' }, query: apply ? { mode: 'apply' as const } : { mode: 'live' as const }, pageType, pageKeys: ['grain', 'view'], features: { ...features, savedView: tools }, ...(tools ? { savedViewSupport: { menuId: 'home', menuSchemaVersion: 1, contextKeys: ['time' as const], pageKeys: ['grain'] } } : {}) };
  const menus = page ? [menu, { ...menu, id: 'alternate', path: '/alternate', primary: false }] : [menu];
  const registry = createRegistry({ spaces: [testSpace()], groups: [{ id: groupId('overview'), space: spaceId('mars'), label: { ko: '개요', en: 'Overview' }, icon: House }], menus });
  window.history.replaceState(null, '', `/${period}`);
  localStorage.setItem('platform:query-bar-collapsed:v1:u1:home', String(!expanded));
  const session = testSession(['platform:view']);
  const queryHistory = tools ? { list: async () => [], record: async () => {}, remove: async () => {}, clear: async () => {} } : undefined;
  return render(<I18nProvider><PlatformProvider registry={registry} queryHistory={queryHistory} savedViews={tools ? createFakeSavedViewStore() : undefined} equipmentAxes={[{ id: 'maker', label: { ko: '제조사', en: 'Maker' }, membershipHistory: false }, { id: 'team', label: { ko: '팀', en: 'Team' }, membershipHistory: false }]} adapter={testAdapter({ session: () => session })} slots={{ contextBar: <GlobalContextBar /> }}>
    {page ?? <PlatformPage layout="fill" contextExtension={<Parameters />} contextNotes={notes ? ['첫 안내', '둘째 안내'] : []} queryBarExtension={metadata ? { pageSummary: summary, appliedPageSummary: summary, issues: issues ? [{ key: 'grain', label: '집계', reason: '잘못된 집계' }] : [] } : undefined} queryResult={result}><Workspace /></PlatformPage>}
  </PlatformProvider></I18nProvider>);
}
beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  vi.stubGlobal('ResizeObserver', class {
    constructor(private callback: ResizeObserverCallback) {}
    observe(target: Element) { this.callback([{ target, contentRect: { width: 1000, height: 600, top: 0, left: 0, right: 1000, bottom: 600, x: 0, y: 0 } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
    unobserve() {}
    disconnect() {}
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('puts applied query conditions, page conditions and workspace commands in one line', async () => {
  mount();
  const bar = screen.getByRole('region', { name: '조회 조건' });
  const row = bar.querySelector<HTMLElement>('[data-workspace-query-row]')!;
  expect(row).toContainElement(within(bar).getByRole('button', { name: /^기간 / }));
  expect(row).toContainElement(within(bar).getByRole('button', { name: '조건 묶음 설비 기준' }));
  expect(row).toContainElement(within(bar).getByRole('button', { name: '집계 시간' }));
  const toolbar = within(bar).getByRole('toolbar', { name: '작업 영역' });
  expect(row).toContainElement(toolbar);
  expect(row).toContainElement(within(bar).getByRole('button', { name: '패널 추가' }));
  expect(row).toContainElement(within(bar).getByRole('button', { name: '조회 조건 동작' }));
  expect(screen.queryByRole('region', { name: '적용된 조회 조건' })).toBeNull();
  expect(document.querySelector('[data-page-head]')).toBeNull();
  expect(document.querySelector('[data-panel-workspace] [data-workspace-toolbar]')).toBeNull();
  await userEvent.click(await screen.findByRole('tab', { name: '요약' }));
  expect(screen.getByText('지표').closest('div')).not.toHaveClass('border');
  await userEvent.click(within(toolbar).getByRole('button', { name: /배치/ }));
  await userEvent.click(screen.getByRole('menuitemradio', { name: '집중' }));
  expect(within(toolbar).getByRole('button', { name: /배치/ })).toHaveTextContent('집중');
});

it('reads the page summary directly from PageFilterBar when the page has no extension metadata', () => {
  mount({ metadata: false });
  const bar = screen.getByRole('region', { name: '조회 조건' });
  expect(within(bar).getByRole('button', { name: '집계 시간' })).toBeVisible();
});

it('lists completion before notices, without counting it, and restores focus on Escape', async () => {
  mount();
  const notice = screen.getByRole('button', { name: '안내 2' });
  await userEvent.click(notice);
  const dialog = await screen.findByRole('dialog', { name: '안내 2' });
  expect(dialog.firstElementChild).toHaveTextContent('요약 조회 완료');
  expect(within(dialog).getAllByRole('listitem').map(item => item.textContent)).toEqual(['첫 안내', '둘째 안내']);
  expect(notice).toHaveAttribute('aria-expanded', 'true');
  await userEvent.keyboard('{Escape}');
  expect(notice).toHaveFocus();
});

it('shows a hidden count only after hiding a panel and restores the panel from the list', async () => {
  mount();
  await userEvent.click(await screen.findByRole('tab', { name: '요약' }));
  await userEvent.click(screen.getByRole('button', { name: '요약 동작' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: '숨기기' }));
  const hidden = await screen.findByRole('button', { name: '숨긴 패널 1' });
  expect(hidden).toHaveTextContent('숨김 1');
  await userEvent.click(hidden);
  expect(hidden).toHaveAttribute('aria-expanded', 'true');
  await userEvent.keyboard('{Escape}');
  expect(hidden).toHaveFocus();
  await userEvent.click(hidden);
  await userEvent.click(await screen.findByRole('menuitem', { name: '요약 다시 보기' }));
  expect(await screen.findByRole('tab', { name: '요약' })).toBeVisible();
  expect(screen.queryByRole('button', { name: /^숨긴 패널/ })).toBeNull();
});

it('omits zero-count handles and keeps completion beside the toolbar', () => {
  mount({ notes: false });
  const row = screen.getByRole('region', { name: '조회 조건' }).querySelector<HTMLElement>('[data-workspace-query-row]')!;
  expect(within(row).queryByRole('button', { name: /숨긴 패널|안내/ })).toBeNull();
  expect(within(row).getByRole('status')).toHaveTextContent('요약 조회 완료');
});

it('folds measured overflow and lists the full accessible chip labels', async () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const width = this.hasAttribute('data-context-chip-lane') ? 100
      : this.parentElement?.hasAttribute('data-context-chip-measure') ? 80 : 0;
    return { width, height: 0, x: 0, y: 0, top: 0, left: 0, right: width, bottom: 0, toJSON: () => ({}) };
  });
  mount();
  const more = screen.getByRole('button', { name: '+3' });
  await userEvent.click(more);
  const list = await screen.findByRole('dialog', { name: /조건/ });
  expect(within(list).getByRole('group', { name: '기간 09-25 → 09-27 (2일)' })).toBeVisible();
  expect(within(list).getByRole('group', { name: '조건 묶음 설비 기준' })).toBeVisible();
  expect(within(list).getByRole('group', { name: '집계 시간' })).toBeVisible();
  await userEvent.keyboard('{Escape}');
  expect(more).toHaveFocus();
});

it.each([
  ['조회 조건 펼치기', '조회 조건'],
  ['집계 시간', '페이지 조건'],
])('opens %s above the content and pins its editor into the page', async (name, dialogName) => {
  mount();
  const handle = screen.getByRole('button', { name });
  const page = document.querySelector('[data-platform-page]')!;
  handle.focus();
  await userEvent.keyboard('{Enter}');
  let dialog = await screen.findByRole('dialog', { name: dialogName });
  expect(handle).toHaveAttribute('aria-expanded', 'true');
  expect(page).not.toContainElement(dialog);
  await userEvent.keyboard('{Escape}');
  expect(handle).toHaveFocus();
  await userEvent.click(handle);
  dialog = await screen.findByRole('dialog', { name: dialogName });
  if (dialogName === '페이지 조건') {
    fireEvent.change(within(dialog).getByRole('textbox', { name: '집계' }), { target: { value: '일' } });
    expect(new Map(draft.draft.page).get('grain')).toBe('일');
    expect(within(dialog).queryByRole('button', { name: '페이지 조건 펼치기' })).toBeNull();
  }
  await userEvent.click(within(dialog).getByRole('button', { name: '편집기 고정' }));
  const pinned = within(page as HTMLElement).getAllByRole('region', { name: dialogName }).find(region => region.hasAttribute('data-context-editor-pinned'))!;
  expect(pinned).toBeVisible();
  expect(within(pinned).getByRole('button', { name: '편집기 고정 해제' })).toHaveFocus();
  if (dialogName === '페이지 조건') expect(within(pinned).getByRole('textbox', { name: '집계' })).toHaveValue('일');
  await userEvent.click(within(pinned).getByRole('button', { name: '편집기 고정 해제' }));
  expect(await screen.findByRole('dialog', { name: dialogName })).toBeVisible();
  expect(pinned).not.toBeInTheDocument();
  await userEvent.keyboard('{Escape}');
  expect(handle).toHaveFocus();
});

it('restores an expanded query preference as a popover with the context line still in place', async () => {
  mount({ expanded: true });
  expect(await screen.findByRole('dialog', { name: '조회 조건' })).toBeVisible();
  expect(document.querySelector('[data-workspace-query-row]')).toBeVisible();
  expect(document.querySelector('[data-context-editor-pinned]')).toBeNull();
});

it.each([
  ['loading', null, false, '불러오는 중…'],
  ['refreshing', new Date(2027, 0, 15, 17).getTime(), false, '같은 조건으로 갱신 중 1월 15일 17:00'],
  ['done', new Date(2026, 11, 31, 17).getTime(), true, '데이터를 불러오지 못했습니다 2026년 12월 31일 17:00'],
] as const)('folded summary status %s uses the local summary notation in the query region', async (status, completedAt, failed, expectedText) => {
  vi.spyOn(Date, 'now').mockReturnValue(new Date(2027, 0, 16, 12).getTime());
  mount({ result: { status, completedAt, failed }, notes: false });
  const bar = screen.getByRole('region', { name: '조회 조건' });
  await within(bar).findByRole('button', { name: '집계 시간' });
  const row = bar.querySelector<HTMLElement>('[data-workspace-query-row]')!;
  expect(within(row).getByRole('status').textContent).toBe(expectedText);
  expect(screen.queryByRole('region', { name: '적용된 조회 조건' })).toBeNull();
});

it.each([
  ['Overview', { pageType: 'overview' as const }],
  ['live', { apply: false }],
  ['Scope gate', { scopeGate: true }],
])('%s keeps the existing page presentation', async (_name, options) => {
  mount(options);
  await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument());
  expect(document.querySelector('[data-workspace-query-row]')).toBeNull();
  expect(screen.queryByRole('button', { name: /페이지 조건/ })).toBeNull();
  if (_name === 'Overview' || _name === 'live') {
    expect(document.querySelector('[data-page-head]')).not.toBeNull();
    expect(document.querySelector('[data-panel-workspace] [data-workspace-toolbar]')).not.toBeNull();
    await userEvent.click(await screen.findByRole('tab', { name: '요약' }));
    expect(screen.getByText('지표').closest('div')).toHaveClass('border');
  }
});

it('keeps pending and issue indicators in the editor handle name', async () => {
  mount({ issues: true });
  const chip = await screen.findByRole('button', { name: /집계 시간.*1/ });
  await userEvent.click(chip);
  const dialog = await screen.findByRole('dialog', { name: '페이지 조건' });
  fireEvent.change(within(dialog).getByRole('textbox', { name: '집계' }), { target: { value: '일' } });
  await userEvent.keyboard('{Escape}');
  expect(chip).toHaveAccessibleName(/집계 시간.*미적용 변경 있음.*1/);
});

it('restores the folded status and page-condition popover after the last toolbar unregisters', async () => {
  function Page() {
    const [show, setShow] = useState(true);
    return <PlatformPage layout="fill" contextExtension={<Parameters />} queryResult={done}>
      <button onClick={() => setShow(false)}>Remove workspace</button>
      {show && <Workspace />}
    </PlatformPage>;
  }
  mount({ page: <Page /> });
  expect(screen.getByRole('toolbar', { name: '작업 영역' })).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Remove workspace' }));
  const bar = screen.getByRole('region', { name: '조회 조건' });
  const row = bar.querySelector<HTMLElement>('[data-workspace-query-row]')!;
  expect(within(row).getByRole('status')).toHaveTextContent('요약 조회 완료');
  expect(within(row).queryByRole('toolbar')).toBeNull();
  expect(screen.queryByRole('region', { name: '적용된 조회 조건' })).toBeNull();
  await userEvent.click(within(row).getByRole('button', { name: '페이지 조건' }));
  expect(within(await screen.findByRole('dialog', { name: '페이지 조건' })).getByRole('textbox', { name: '집계' })).toHaveValue('시간');
});

const pinnedTools = [
  ['최근 조건', () => screen.getByRole('dialog', { name: '최근 조건' })],
  ['뷰 선택', () => screen.getByRole('searchbox', { name: '뷰 이름 검색' }).closest('[role="dialog"]')],
] as const;

it.each(pinnedTools)('opens %s from the pinned query menu and returns focus to the menu button', async (name, surface) => {
  mount({ tools: true });
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: '조회 조건 펼치기' }));
  await user.click(screen.getByRole('button', { name: '편집기 고정' }));
  const pinned = document.querySelector('[data-context-editor-pinned]')!;
  const more = screen.getByRole('button', { name: '조회 조건 동작' });
  await user.click(more);
  await user.click(await screen.findByRole('menuitem', { name }));
  await waitFor(() => expect(surface()).toBeVisible());
  await user.keyboard('{Escape}');
  await waitFor(() => expect(more).toHaveFocus());
  expect(pinned).toBeVisible();
});

it.each(pinnedTools)('keeps focus on the pinned start date after dismissing %s', async (name, surface) => {
  mount({ tools: true });
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: '조회 조건 펼치기' }));
  await user.click(screen.getByRole('button', { name: '편집기 고정' }));
  const pinned = document.querySelector<HTMLElement>('[data-context-editor-pinned]')!;
  const date = within(pinned).getByLabelText('시작일');
  await user.click(screen.getByRole('button', { name: '조회 조건 동작' }));
  await user.click(await screen.findByRole('menuitem', { name }));
  const dialog = await waitFor(() => {
    const opened = surface();
    expect(opened).toBeVisible();
    return opened;
  });
  await user.click(date);
  expect(dialog).not.toBeInTheDocument();
  // Radix runs close autofocus in a timer after the popover unmounts.
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  expect(date).toHaveFocus();
});

it('keeps a page draft after outside dismissal and restores focus on Escape', async () => {
  mount();
  const user = userEvent.setup();
  const handle = screen.getByRole('button', { name: '집계 시간' });
  await user.click(handle);
  const dialog = await screen.findByRole('dialog', { name: '페이지 조건' });
  fireEvent.change(within(dialog).getByRole('textbox', { name: '집계' }), { target: { value: '일' } });
  await user.click(screen.getByRole('heading', { level: 1 }));
  expect(dialog).not.toBeInTheDocument();
  await user.click(handle);
  expect(within(await screen.findByRole('dialog', { name: '페이지 조건' })).getByRole('textbox', { name: '집계' })).toHaveValue('일');
  await user.keyboard('{Escape}');
  expect(handle).toHaveFocus();
});

function mockMeasuredLane(initialWidth: number, chipWidth: (text: string) => number) {
  let laneWidth = initialWidth;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const width = this.hasAttribute('data-context-chip-lane') ? laneWidth
      : this.parentElement?.hasAttribute('data-context-chip-measure') ? chipWidth(this.textContent ?? '') : 0;
    return { width, height: 0, x: 0, y: 0, top: 0, left: 0, right: width, bottom: 0, toJSON: () => ({}) };
  });
  const observed = new Map<Element, Set<() => void>>();
  vi.stubGlobal('ResizeObserver', class {
    private targets = new Set<Element>();
    constructor(private callback: ResizeObserverCallback) {}
    notify = (target?: Element) => this.callback(target ? [{ target, contentRect: target.getBoundingClientRect() } as ResizeObserverEntry] : [], this as unknown as ResizeObserver);
    observe(target: Element) {
      this.targets.add(target);
      const callbacks = observed.get(target) ?? new Set();
      callbacks.add(this.notify);
      observed.set(target, callbacks);
    }
    unobserve(target: Element) { this.targets.delete(target); observed.get(target)?.delete(this.notify); }
    disconnect() { for (const target of this.targets) this.unobserve(target); }
  });
  return {
    observed,
    resize(target: Element, width = laneWidth) {
      laneWidth = width;
      act(() => { for (const notify of observed.get(target) ?? []) notify(); });
    },
  };
}

it('remeasures exchanged keys and surviving nodes and recovers after zero chips fit', async () => {
  let periodWidth = 60;
  const measure = mockMeasuredLane(200, text => {
    if (text.startsWith('+')) return 30;
    if (text.startsWith('기간')) return periodWidth;
    return text.includes('긴 값') ? 150 : 60;
  });
  function Page() {
    const [item, setItem] = useState({ key: 'grain', label: '집계', value: '시간' });
    return <PlatformPage layout="fill" contextExtension={<button>Parameters</button>} queryBarExtension={{ appliedPageSummary: [item] }}>
      <button onClick={() => setItem({ key: 'replacement', label: '집계', value: '아주 긴 값' })}>Replace chip</button>
      <Workspace />
    </PlatformPage>;
  }
  mount({ page: <Page /> });
  const probe = document.querySelector('[data-context-chip-measure]')!;
  const lane = document.querySelector('[data-context-chip-lane]')!;
  const oldChip = probe.children[2]!;
  expect(screen.getByRole('button', { name: '집계 시간' })).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Replace chip' }));
  expect(probe.children[2]).not.toBe(oldChip);
  expect(measure.observed.get(oldChip)?.size ?? 0).toBe(0);
  expect(measure.observed.get(probe.children[2]!)?.size).toBe(1);
  expect(screen.getByRole('button', { name: '+1' })).toBeVisible();
  periodWidth = 180;
  measure.resize(probe.children[0]!);
  expect(screen.getByRole('button', { name: '+3' })).toBeVisible();
  measure.resize(lane, 450);
  expect(screen.queryByRole('button', { name: /^\+\d+$/ })).toBeNull();
  expect(screen.getByRole('button', { name: '집계 아주 긴 값' })).toBeVisible();
});

it('moves focus from a folded chip to +n and back into the line when the list disappears', async () => {
  const measure = mockMeasuredLane(250, text => text.startsWith('+') ? 30 : 60);
  mount();
  const lane = document.querySelector('[data-context-chip-lane]')!;
  screen.getByRole('button', { name: '집계 시간' }).focus();
  measure.resize(lane, 100);
  const more = screen.getByRole('button', { name: '+2' });
  expect(more).toHaveFocus();
  await userEvent.keyboard('{Enter}');
  const list = await screen.findByRole('dialog', { name: '나머지 조건' });
  expect(list).toHaveFocus();
  measure.resize(lane, 250);
  expect(list).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '조건 묶음 설비 기준' })).toHaveFocus();
});

function mountAppliedChipExchange(initialWide: boolean) {
  mockMeasuredLane(260, text => text.startsWith('+') ? 30 : text.includes('긴 값') ? 140 : 60);
  let setWide: (wide: boolean) => void;
  function Page() {
    const [wide, updateWide] = useState(initialWide);
    setWide = updateWide;
    const items = [
      wide ? { key: 'wide', label: '집계', value: '긴 값' } : { key: 'short', label: '집계', value: '시간' },
      { key: 'stable', label: '설비', value: 'A' },
    ];
    return <PlatformPage layout="fill" contextExtension={<button>Parameters</button>} queryBarExtension={{ appliedPageSummary: items }}>
      <label>Outside field <input /></label>
      <Workspace />
    </PlatformPage>;
  }
  mount({ page: <Page /> });
  return (wide: boolean) => act(() => setWide(wide));
}

it('moves focus into the line when an applied chip exchange removes overflow at the same lane width', async () => {
  const exchange = mountAppliedChipExchange(true);
  await userEvent.click(screen.getByRole('button', { name: '+2' }));
  const list = await screen.findByRole('dialog', { name: '나머지 조건' });
  expect(list).toHaveFocus();

  exchange(false);

  expect(list).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '+2' })).toBeNull();
  const lane = document.querySelector<HTMLElement>('[data-context-chip-lane]')!;
  expect(within(lane).getAllByRole('button')).toContain(document.activeElement);
});

it('moves focus to overflow when an applied chip exchange folds a surviving focused chip', () => {
  const exchange = mountAppliedChipExchange(false);
  const chip = screen.getByRole('button', { name: '설비 A' });
  chip.focus();

  exchange(true);

  expect(chip).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '+2' })).toHaveFocus();
});

it('keeps focus on an external field across an applied chip exchange', async () => {
  const exchange = mountAppliedChipExchange(true);
  const field = screen.getByRole('textbox', { name: 'Outside field' });
  await userEvent.click(field);
  expect(field).toHaveFocus();

  exchange(false);

  expect(screen.queryByRole('button', { name: '+2' })).toBeNull();
  expect(field).toHaveFocus();
});

it('keeps applied page metadata through global and page drafts, Apply and a same-count route change', async () => {
  function Page() {
    const { global, pageParams } = usePlatform();
    const query = useQueryDraft();
    const items = (value: string) => [{ key: 'grain', label: '집계', value }];
    const applied = pageParams('grain')[0] ?? '시간';
    const value = new Map(query.draft.page).get('grain') ?? (query.draft.global.from === global.from ? applied : '일');
    return <PlatformPage layout="fill" contextExtension={<Parameters />} queryBarExtension={{ pageSummary: items(value), appliedPageSummary: items(applied) }}>
      <Workspace />
    </PlatformPage>;
  }
  mount({ page: <Page /> });
  const lane = () => within(document.querySelector<HTMLElement>('[data-context-chip-lane]')!);
  expect(lane().getByRole('button', { name: '집계 시간' })).toBeVisible();
  const chipCount = lane().getAllByRole('button').length;
  act(() => draft.setDraftGlobal({ from: '2026-09-24T09:00:00' }));
  expect(lane().getByRole('button', { name: '집계 시간' })).toBeVisible();
  act(() => draft.setDraftPage({ grain: '일' }));
  expect(lane().getByRole('button', { name: /^집계 시간/ })).toBeVisible();
  expect(lane().queryByRole('button', { name: /^집계 일/ })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: '조회 조건 펼치기' }));
  await userEvent.click(screen.getByRole('button', { name: '편집기 고정' }));
  const pinned = screen.getByRole('button', { name: '편집기 고정 해제' }).closest('section')!;
  await userEvent.click(within(pinned).getByRole('button', { name: '적용' }));
  expect(await lane().findByRole('button', { name: '집계 일' })).toBeVisible();
  expect(pinned).toBeVisible();
  expect(screen.queryByRole('region', { name: '적용된 조회 조건' })).toBeNull();
  act(() => {
    window.history.pushState(null, '', `/alternate${period}&grain=주`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  expect(await lane().findByRole('button', { name: '집계 주' })).toBeVisible();
  expect(lane().queryByRole('button', { name: '집계 일' })).toBeNull();
  expect(lane().getAllByRole('button')).toHaveLength(chipCount);
  expect(pinned).not.toBeInTheDocument();
});

it('keeps the legacy page-condition disclosure for draft-only metadata', () => {
  function Page() {
    const query = useQueryDraft();
    const draftSummary = [{ key: 'grain', label: '집계', value: query.draft.global.from === '2026-09-24T09:00:00' ? '일' : '시간' }];
    return <PlatformPage layout="fill" contextExtension={<Parameters />} queryBarExtension={{ pageSummary: draftSummary }}><Workspace /></PlatformPage>;
  }
  mount({ page: <Page /> });
  act(() => draft.setDraftGlobal({ from: '2026-09-24T09:00:00' }));
  expect(screen.getByRole('button', { name: /페이지 조건.*집계 일/ })).toBeVisible();
  expect(document.querySelector('[data-context-chip-lane]')).toBeNull();
});

it('uses a draft filter bar’s applied chips when the extension has no summary', async () => {
  function Filters() {
    const query = useQueryDraft();
    const value = new Map(query.draft.page).get('grain') ?? '시간';
    return <PageFilterBar mode="draft" label="집계" collapsible preferenceKey="draft-parameters"
      summaryItems={[{ key: 'grain', label: '집계', value }]}
      appliedChips={[{ key: 'grain', label: '집계', value: '시간' }]}
      fields={[{ key: 'grain', kind: 'text', label: '집계', value, onValueChange: grain => query.setDraftPage({ grain }) }]} />;
  }
  mount({ page: <PlatformPage layout="fill" contextExtension={<Filters />}><Workspace /></PlatformPage> });
  const chip = screen.getByRole('button', { name: '집계 시간' });
  await userEvent.click(chip);
  fireEvent.change(within(screen.getByRole('dialog', { name: '페이지 조건' })).getByRole('textbox', { name: '집계' }), { target: { value: '일' } });
  await userEvent.keyboard('{Escape}');
  expect(chip).toHaveAccessibleName(/^집계 시간/);
  expect(screen.queryByRole('button', { name: /^집계 일/ })).toBeNull();
});
