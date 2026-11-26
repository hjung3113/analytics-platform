// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { House } from 'lucide-react';
import { I18nProvider, PlatformProvider, createRegistry, usePlatform, type MenuEntry } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { createChartPanel, groupId, spaceId, type MenuChartFields, type Permission } from '@ap/contracts';
import { PanelAddMenu, usePageKeyRules, usePinnedPanels, type PanelAddItem } from '../../index';

afterEach(() => { cleanup(); });

const KNOWN = ['dist', 'scatter', 'trend'];
const menu: MenuEntry = {
  id: 'home', path: '/bars', primary: true, group: groupId('overview'), label: { ko: '막대', en: 'Bars' }, description: { ko: '', en: '' }, icon: House,
  permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'analysis', query: { mode: 'live' as const },
  features: { export: false, savedView: false, annotate: false, compare: false },
  pageKeys: ['pins'], repeatedPageKeys: ['pins'],
};
const registry = createRegistry({ spaces: [testSpace()], groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }], menus: [menu] });
const session = testSession(['platform:view']);

function Probe() {
  const { pinned, toggle, pin, unpin, rules } = usePinnedPanels('pins', KNOWN);
  const { badKeys } = usePageKeyRules(rules);
  return <section>
    <output data-testid="pinned">{pinned.join(',') || 'none'}</output>
    <output data-testid="bad">{badKeys.join(',') || 'none'}</output>
    <button type="button" onClick={() => { toggle('dist'); }}>toggle dist</button>
    <button type="button" onClick={() => { pin('scatter'); }}>pin scatter</button>
    <button type="button" onClick={() => { pin('nope'); }}>pin unknown</button>
    <button type="button" onClick={() => { pin('dist'); pin('scatter'); }}>pin two</button>
    <button type="button" onClick={() => { unpin('dist'); unpin('scatter'); }}>unpin two</button>
    <button type="button" onClick={() => { toggle('trend'); toggle('dist'); }}>toggle two</button>
  </section>;
}
const mount = (search = '') => {
  window.history.replaceState(null, '', `/bars${search}`);
  return render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}><Probe /></PlatformProvider></I18nProvider>);
};
const pinned = () => screen.getByTestId('pinned').textContent;
const keys = () => new URLSearchParams(window.location.search).getAll('pins');

describe('usePinnedPanels (#2398)', () => {
  it('nothing pinned is the key\'s absence; pins write a repeated key in pin order and the last unpin clears it', async () => {
    const user = userEvent.setup();
    mount();
    expect(pinned()).toBe('none');
    await user.click(screen.getByRole('button', { name: 'toggle dist' }));
    await user.click(screen.getByRole('button', { name: 'pin scatter' }));
    expect(keys()).toEqual(['dist', 'scatter']);
    expect(pinned()).toBe('dist,scatter');
    await user.click(screen.getByRole('button', { name: 'pin unknown' }));
    expect(keys()).toEqual(['dist', 'scatter']);
    await user.click(screen.getByRole('button', { name: 'toggle dist' }));
    expect(keys()).toEqual(['scatter']);
    await user.click(screen.getByRole('button', { name: 'pin scatter' }));
    expect(keys()).toEqual(['scatter']);
    await user.click(screen.getByRole('button', { name: 'toggle dist' }));
    await user.click(screen.getByRole('button', { name: 'toggle dist' }));
    expect(keys()).toEqual(['scatter']);
    await user.click(screen.getByRole('button', { name: 'unpin two' }));
    expect(keys()).toEqual([]);
    expect(new URLSearchParams(window.location.search).has('pins')).toBe(false);
  });

  it('several changes in one callback build on each other (two pins, two unpins, two toggles)', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: 'pin two' }));
    expect(keys()).toEqual(['dist', 'scatter']);
    await user.click(screen.getByRole('button', { name: 'toggle two' }));
    expect(keys()).toEqual(['scatter', 'trend']);
    await user.click(screen.getByRole('button', { name: 'unpin two' }));
    expect(keys()).toEqual(['trend']);
  });

  it('after Back the next change starts from the address, not from the set written before', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: 'toggle dist' }));
    expect(keys()).toEqual(['dist']);
    window.history.back();
    await vi.waitFor(() => { expect(pinned()).toBe('none'); });
    await user.click(screen.getByRole('button', { name: 'pin scatter' }));
    expect(keys()).toEqual(['scatter']);
  });

  it('reads a link back, ignores unknown ids without rewriting them and reports them through the rules', () => {
    mount('?pins=trend&pins=bogus&pins=trend');
    expect(pinned()).toBe('trend');
    expect(keys()).toEqual(['trend', 'bogus', 'trend']);
    expect(screen.getByTestId('bad').textContent).toBe('pins');
  });
});

describe('PanelAddMenu (#2398)', () => {
  const ITEMS: PanelAddItem[] = [
    { id: 'trend', title: { ko: 'HTM 추세', en: 'HTM trend' } },
    { id: 'dist', title: { ko: '분포', en: 'Distribution' } },
    { id: 'scatter', title: { ko: '산점도', en: 'Scatter' }, disabledReason: { ko: '이 단계에서는 쓸 수 없음', en: 'Not at this step' } },
  ];
  const open = (props: Partial<Parameters<typeof PanelAddMenu>[0]> = {}) => {
    const onAdd = vi.fn();
    render(<I18nProvider><PanelAddMenu items={ITEMS} shown={['trend']} onAdd={onAdd} {...props} /></I18nProvider>);
    return onAdd;
  };

  it('remounts a repopulated catalog closed and keeps the pin choice', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const picker = (items: PanelAddItem[]) => <I18nProvider><PanelAddMenu items={items} onAdd={onAdd} /></I18nProvider>;
    const { rerender } = render(picker(ITEMS));
    await user.click(screen.getByRole('button', { name: '패널 추가' }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: '추가하면 고정' }));
    rerender(picker([]));
    expect(screen.queryByRole('button', { name: '패널 추가' })).not.toBeInTheDocument();
    rerender(picker(ITEMS));
    const trigger = screen.getByRole('button', { name: '패널 추가' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);
    expect(screen.getByRole('menuitemcheckbox', { name: '추가하면 고정' })).not.toBeChecked();
  });

  it('lists the offered panels; one already shown and one with a reason are disabled and say why', async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole('button', { name: '패널 추가' }));
    expect(await screen.findByRole('menuitem', { name: /HTM 추세.*이미 있음/ })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('menuitem', { name: /산점도.*이 단계에서는 쓸 수 없음/ })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('menuitem', { name: '분포' })).not.toHaveAttribute('aria-disabled');
  });

  it('arrow keys reach a disabled item so its reason is read; Enter on it neither adds nor closes the menu', async () => {
    const user = userEvent.setup();
    const onAdd = open();
    screen.getByRole('button', { name: '패널 추가' }).focus();
    await user.keyboard('{Enter}');
    const first = await screen.findByRole('menuitem', { name: /HTM 추세.*이미 있음/ });
    await vi.waitFor(() => { expect(first).toHaveFocus(); });
    await user.keyboard('{ArrowDown}{ArrowDown}');
    const scatter = screen.getByRole('menuitem', { name: /산점도.*이 단계에서는 쓸 수 없음/ });
    expect(scatter).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('adds with «추가하면 고정» on by default; unchecking keeps the menu open and adds without pinning', async () => {
    const user = userEvent.setup();
    const onAdd = open();
    await user.click(screen.getByRole('button', { name: '패널 추가' }));
    const check = await screen.findByRole('menuitemcheckbox', { name: '추가하면 고정' });
    expect(check).toHaveAttribute('aria-checked', 'true');
    await user.click(check);
    expect(screen.getByRole('menuitemcheckbox', { name: '추가하면 고정' })).toHaveAttribute('aria-checked', 'false');
    await user.click(screen.getByRole('menuitem', { name: '분포' }));
    expect(onAdd).toHaveBeenCalledWith('dist', false);
    await user.click(screen.getByRole('button', { name: '패널 추가' }));
    await user.click(await screen.findByRole('menuitem', { name: '분포' }));
    expect(onAdd).toHaveBeenLastCalledWith('dist', false);
  });

  it('pins on add by default and draws nothing without items', async () => {
    const user = userEvent.setup();
    const onAdd = open();
    await user.click(screen.getByRole('button', { name: '패널 추가' }));
    await user.click(await screen.findByRole('menuitem', { name: '분포' }));
    expect(onAdd).toHaveBeenCalledWith('dist', true);
    cleanup();
    open({ items: [] });
    expect(screen.queryByRole('button', { name: '패널 추가' })).toBeNull();
  });

  it('keeps a long uncategorized list flat even when the rows declare kinds', async () => {
    const user = userEvent.setup();
    open({ items: Array.from({ length: 9 }, (_, index) => ({ ...ITEMS[0]!, id: `panel-${index}`, kind: 'line' })) });
    await user.click(screen.getByRole('button', { name: '패널 추가' }));
    expect(screen.getAllByRole('menuitem')).toHaveLength(9);
    expect(screen.getByRole('menuitemcheckbox', { name: '추가하면 고정' })).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).toBeNull();
  });
});

describe('PanelAddMenu categorized picker (#2744)', () => {
  const text = (ko: string, en: string) => ({ ko, en });
  const compare = { id: 'compare', title: text('비교', 'Compare') };
  const trend = { id: 'trend', title: text('추세', 'Trend') };
  const items: PanelAddItem[] = [
    { id: 'bars', category: compare, kind: 'bar', title: text('장비 비교', 'Equipment comparison'), description: text('장비별 평균', 'Average by equipment') },
    { id: 'scatter', category: compare, kind: 'scatter', title: text('산점도', 'Scatter') },
    { id: 'line', category: trend, kind: 'line', title: text('장비 추세', 'Equipment trend'), description: text('일별 평균', 'Daily average') },
  ];
  async function open(panels = items) {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<I18nProvider><PanelAddMenu items={panels} shown={['line']} onAdd={onAdd} /></I18nProvider>);
    const trigger = screen.getByRole('button', { name: '패널 추가' });
    await user.click(trigger);
    return { user, onAdd, trigger, search: screen.getByRole('searchbox', { name: '패널 검색' }) };
  }
  const row = (name: string) => screen.getByRole('button', { name });

  it('groups localized rows under category headings with counts', async () => {
    await open();
    expect(within(screen.getByRole('region', { name: /비교/ })).getAllByRole('button')).toEqual([row('장비 비교'), row('산점도')]);
    expect(screen.getAllByRole('heading', { level: 3 }).map(heading => heading.textContent)).toEqual(['비교2', '추세1']);
  });

  it('groups a panel without kind or category under Other and still previews its text', async () => {
    const { user } = await open([
      ...items,
      { id: 'records', title: text('원본 기록', 'Records'), description: text('전체 행', 'All rows') },
      { id: 'summary', category: { id: 'other', title: text('요약', 'Summary') }, title: text('합계', 'Total') },
    ]);
    expect(within(screen.getByRole('region', { name: '기타 1' })).getAllByRole('button')).toEqual([row('원본 기록')]);
    expect(within(screen.getByRole('region', { name: '요약 1' })).getAllByRole('button')).toEqual([row('합계')]);
    await user.keyboard('{ArrowDown}{ArrowRight}{ArrowRight}');
    expect(row('원본 기록')).toHaveFocus();
    expect(screen.getByRole('complementary')).toHaveTextContent('원본 기록전체 행');
  });

  it('previews the title and description on hover and keyboard focus', async () => {
    const { user } = await open();
    const preview = screen.getByRole('complementary');
    await user.hover(row('장비 비교'));
    expect(preview).toHaveTextContent('장비 비교장비별 평균');
    await user.keyboard('{ArrowDown}{ArrowRight}');
    expect(preview).toHaveTextContent('장비 추세이미 있음일별 평균');
  });

  it('shows a one-line status in the row, the full reason in the preview, and the first addable row when nothing is pointed at', async () => {
    const { user } = await open([
      { ...items[0]!, disabledReason: text('Module 타입을 고르면 볼 수 있음', 'Pick a module type to see it') },
      ...items.slice(1),
    ]);
    const preview = screen.getByRole('complementary');
    expect(preview).toHaveTextContent(/^산점도$/);
    expect(row('장비 비교')).toHaveTextContent(/^장비 비교사용할 수 없음/);
    expect(row('장비 비교')).toHaveAccessibleDescription('사용할 수 없음 · Module 타입을 고르면 볼 수 있음 · 막대 차트 · 장비별 평균');
    expect(row('장비 추세')).toHaveTextContent(/^장비 추세이미 있음/);
    await user.keyboard('{ArrowDown}');
    expect(row('장비 비교')).toHaveFocus();
    expect(preview).toHaveTextContent('장비 비교Module 타입을 고르면 볼 수 있음장비별 평균');
  });

  it('filters both columns and hides empty columns and their previews', async () => {
    const { user, search } = await open();
    await user.type(search, '장비');
    expect(screen.getAllByRole('heading', { name: /1/, level: 3 })).toHaveLength(2);
    const preview = screen.getByRole('complementary');
    await user.hover(row('장비 비교'));
    expect(preview).toHaveTextContent('장비 비교장비별 평균');
    await user.keyboard(' 추세');
    expect(screen.queryByRole('heading', { name: /비교/ })).toBeNull();
    expect(preview).not.toHaveTextContent(/장비 비교|장비별 평균/);
    await user.keyboard('{Backspace}{Backspace}{Backspace}');
    expect(row('장비 비교')).toBeInTheDocument();
    expect(preview).toHaveTextContent('장비 비교장비별 평균');
    await user.keyboard('x');
    expect(screen.getByRole('status')).toHaveTextContent('일치하는 패널이 없습니다.');
  });

  it('tracks row boundaries and lets pointer movement take the preview back from keyboard focus', async () => {
    const { user } = await open();
    const preview = screen.getByRole('complementary');
    const bars = row('장비 비교');
    const heading = screen.getByRole('heading', { name: '비교 2' });
    const scatter = row('산점도');
    fireEvent.pointerOver(scatter);
    expect(preview).toHaveTextContent('산점도');
    fireEvent.pointerOut(scatter, { relatedTarget: heading });
    expect(preview).not.toHaveTextContent('산점도');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(preview).toHaveTextContent('산점도');
    fireEvent.pointerMove(bars);
    expect(preview).toHaveTextContent('장비 비교');
    fireEvent.pointerOut(bars, { relatedTarget: heading });
    expect(preview).toHaveTextContent('산점도');
  });

  it('navigates between columns, retains the disabled reason, and returns to search or the opener', async () => {
    const { user, onAdd, search, trigger } = await open();
    expect(search).toHaveFocus();
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(row('산점도')).toHaveFocus();
    await user.keyboard('{ArrowRight}{Enter} ');
    expect(row('장비 추세')).toHaveFocus();
    expect(row('장비 추세')).toHaveAccessibleDescription('이미 있음 · 선 차트 · 일별 평균');
    expect(onAdd).not.toHaveBeenCalled();
    await user.keyboard('{ArrowLeft}{ArrowDown}장');
    expect(row('장비 비교')).toHaveFocus();
    await user.keyboard('{ArrowDown}{ArrowUp}');
    expect(row('장비 비교')).toHaveFocus();
    await user.keyboard('/');
    expect(search).toHaveFocus();
    await user.type(search, '장비');
    await user.keyboard('{Escape}');
    await vi.waitFor(() => { expect(trigger).toHaveFocus(); });
  });

  it('keeps the open dialog and moves focus to the replacement search after a Scope change', async () => {
    const user = userEvent.setup();
    let platform: ReturnType<typeof usePlatform>;
    const onAdd = vi.fn();
    const scopes = ['MEM', 'FDRY'].map(id => ({ id, label: id, grantedRooms: 1, totalRooms: 1 }));
    const scopeSession = testSession(['platform:view'], { scopes });
    function Picker() {
      platform = usePlatform();
      return <PanelAddMenu items={items} onAdd={onAdd} />;
    }
    window.history.replaceState(null, '', '/bars?v=1&scopeId=MEM');
    render(<I18nProvider><PlatformProvider registry={registry} adapter={testAdapter({ session: () => scopeSession })}><Picker /></PlatformProvider></I18nProvider>);
    const trigger = row('패널 추가');
    await user.click(trigger);
    const dialog = screen.getByRole('dialog');
    const search = screen.getByRole('searchbox');
    await user.keyboard('장비{ArrowDown}');
    expect(row('장비 비교')).toHaveFocus();

    act(() => platform.setGlobal({ scopeId: 'FDRY' }));
    // Radix schedules unmount autofocus on the next timer tick.
    await act(() => new Promise(resolve => { setTimeout(resolve, 0); }));
    expect(platform!.scope.scopeId).toBe('FDRY');
    const replacement = screen.getByRole('searchbox');
    expect(replacement).toHaveFocus();
    expect(replacement).not.toBe(search);
    expect(replacement).toHaveValue('');
    expect(screen.getByRole('dialog')).toBe(dialog);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await vi.waitFor(() => { expect(trigger).toHaveFocus(); });
  });

  it('moves horizontally to the nearest visible row when the row heights differ', async () => {
    const { user } = await open();
    vi.spyOn(row('장비 비교'), 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 40));
    vi.spyOn(row('산점도'), 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 40, 100, 28));
    vi.spyOn(row('장비 추세'), 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 0, 100, 100));
    await user.keyboard('{ArrowDown}{ArrowRight}{ArrowLeft}');
    expect(row('산점도')).toHaveFocus();
  });

  it('adds a declared panel with the selected pin option', async () => {
    const { user, onAdd, search } = await open();
    await user.click(screen.getByRole('checkbox', { name: '추가하면 고정' }));
    await user.type(search, '산점도');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onAdd).toHaveBeenCalledExactlyOnceWith('scatter', false);
  });
});

describe('PanelAddMenu chart picker (#2761)', () => {
  const fields: MenuChartFields = {
    time: { field: 'day', label: { ko: '일자', en: 'Day' } },
    measures: [
      { id: 'average', label: { ko: '평균', en: 'Average' }, unit: 's', reaggregation: 'none', breakdowns: ['equipment'] },
      { id: 'samples', label: { ko: '건수', en: 'Count' }, unit: '건', reaggregation: 'sum', permission: 'console:access' },
    ],
    breakdowns: [
      { id: 'equipment', label: { ko: '설비', en: 'Equipment' }, dimension: 'equipment' },
      { id: 'module', label: { ko: '모듈', en: 'Module' }, dimension: 'module' },
      { id: 'motion', label: { ko: '모션', en: 'Motion' }, dimension: 'motion' },
    ],
  };
  async function open({ chartFields = fields, permissions = [], keyboard = false, openKey = '{Enter}' }: {
    chartFields?: MenuChartFields | null; permissions?: Permission[]; keyboard?: boolean; openKey?: string;
  } = {}) {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const items = [
      { id: 'trend', title: { ko: '추세', en: 'Trend' } },
      { id: 'detail', title: { ko: '상세', en: 'Detail' }, disabledReason: { ko: '이 단계에서는 쓸 수 없음', en: 'Not at this step' } },
      { id: 'limit', title: { ko: '상한 초과', en: 'Over limit' } },
    ];
    const fixture = { ...menu, chartFields: chartFields ?? undefined };
    const chartRegistry = createRegistry({ spaces: [testSpace()], groups: registry.groups, menus: [fixture] });
    const chartSession = testSession(['platform:view', ...permissions]);
    function Picker() {
      const { route } = usePlatform();
      return <PanelAddMenu items={items} shown={['chart-1']} existingIds={['chart-2']} chartFields={route?.menu.chartFields} onAdd={onAdd} />;
    }
    window.history.replaceState(null, '', '/bars');
    render(<I18nProvider><PlatformProvider registry={chartRegistry} adapter={testAdapter({ session: () => chartSession })}><Picker /></PlatformProvider></I18nProvider>);
    const trigger = screen.getByRole('button', { name: '패널 추가' });
    if (keyboard) {
      await user.tab();
      expect(trigger).toHaveFocus();
      await user.keyboard(openKey);
    } else await user.click(trigger);
    return { user, onAdd, trigger };
  }
  const radio = (name: string) => screen.getByRole('radio', { name });
  const add = () => screen.getByRole('button', { name: '더하기' });

  it('creates a chart below the categorized list and pin check', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const title = { ko: '비교', en: 'Compare' };
    render(<I18nProvider><PanelAddMenu items={[{ id: 'bars', title, category: { id: 'compare', title } }]} chartFields={fields} onAdd={onAdd} /></I18nProvider>);
    await user.click(screen.getByRole('button', { name: '패널 추가' }));
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
    await user.click(radio('선'));
    await user.click(radio('평균'));
    await user.click(radio('설비'));
    await user.click(add());
    expect(onAdd).toHaveBeenCalledExactlyOnceWith('chart-1', true, expect.objectContaining({ id: 'chart-1' }));
  });

  it('moves focus to the replacement search when a Scope change replaces the focused chart chip', async () => {
    const user = userEvent.setup();
    let platform: ReturnType<typeof usePlatform>;
    const title = { ko: '비교', en: 'Compare' };
    const scopes = ['MEM', 'FDRY'].map(id => ({ id, label: id, grantedRooms: 1, totalRooms: 1 }));
    const scopeSession = testSession(['platform:view'], { scopes });
    function Picker() {
      platform = usePlatform();
      return <PanelAddMenu items={[{ id: 'bars', title, category: { id: 'compare', title } }]} chartFields={fields} onAdd={vi.fn()} />;
    }
    window.history.replaceState(null, '', '/bars?v=1&scopeId=MEM');
    render(<I18nProvider><PlatformProvider registry={registry} adapter={testAdapter({ session: () => scopeSession })}><Picker /></PlatformProvider></I18nProvider>);
    const trigger = screen.getByRole('button', { name: '패널 추가' });
    await user.click(trigger);
    const dialog = screen.getByRole('dialog');
    await user.click(radio('선'));
    expect(radio('선')).toHaveFocus();

    act(() => platform.setGlobal({ scopeId: 'FDRY' }));
    await act(() => new Promise(resolve => { setTimeout(resolve, 0); }));
    expect(platform!.scope.scopeId).toBe('FDRY');
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(screen.getByRole('searchbox')).toHaveFocus();
    expect(radio('선')).toHaveAttribute('aria-checked', 'false');
    await user.keyboard('{Escape}');
    await vi.waitFor(() => { expect(trigger).toHaveFocus(); });
  });

  it('keeps focus on the pin check when a Scope change replaces the sections around it', async () => {
    const user = userEvent.setup();
    let platform: ReturnType<typeof usePlatform>;
    const title = { ko: '비교', en: 'Compare' };
    const scopes = ['MEM', 'FDRY'].map(id => ({ id, label: id, grantedRooms: 1, totalRooms: 1 }));
    const scopeSession = testSession(['platform:view'], { scopes });
    function Picker() {
      platform = usePlatform();
      return <PanelAddMenu items={[{ id: 'bars', title, category: { id: 'compare', title } }]} chartFields={fields} onAdd={vi.fn()} />;
    }
    window.history.replaceState(null, '', '/bars?v=1&scopeId=MEM');
    render(<I18nProvider><PlatformProvider registry={registry} adapter={testAdapter({ session: () => scopeSession })}><Picker /></PlatformProvider></I18nProvider>);
    await user.click(screen.getByRole('button', { name: '패널 추가' }));
    const pin = screen.getByRole('checkbox', { name: '추가하면 고정' });
    pin.focus();
    act(() => platform.setGlobal({ scopeId: 'FDRY' }));
    await act(() => new Promise(resolve => { setTimeout(resolve, 0); }));
    expect(pin).toHaveFocus();
  });

  it('keeps the declared-panel menu when chartFields are absent', async () => {
    await open({ chartFields: null });
    expect(await screen.findByRole('menuitem', { name: '추세' })).toBeInTheDocument();
    expect(screen.queryByText('종류로 만들기')).not.toBeInTheDocument();
  });

  it('offers the measures and breakdowns after a kind, with Add disabled until both are chosen', async () => {
    const { user } = await open();
    expect(screen.getByRole('toolbar', { name: '이 메뉴의 패널' })).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: '지표' })).not.toBeInTheDocument();
    await user.click(radio('선'));
    expect(radio('평균')).toBeInTheDocument();
    expect(radio('설비')).toBeInTheDocument();
    expect(add()).toBeDisabled();
  });

  it.each([['선', 'line', true], ['막대', 'bar', false]] as const)('previews %s and passes the created instance with the pin choice', async (label, kind, pin) => {
    const { user, onAdd } = await open();
    if (!pin) await user.click(screen.getByRole('checkbox', { name: '추가하면 고정' }));
    await user.click(radio(label));
    await user.click(radio('평균'));
    await user.click(radio('설비'));
    expect(screen.getByText('평균 · 설비')).toBeInTheDocument();
    expect(add()).toBeEnabled();
    await user.click(add());
    const expected = createChartPanel(fields, { kind, measure: 'average', breakdown: 'equipment' }, 'chart-3', () => false);
    expect(expected.status).toBe('ok');
    if (expected.status === 'ok') expect(onAdd).toHaveBeenCalledExactlyOnceWith('chart-3', pin, expected.instance);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('dims a rejected breakdown with its reason and gates Add even when it was selected first', async () => {
    const { user, onAdd } = await open();
    await user.click(radio('막대'));
    await user.click(radio('모듈'));
    await user.click(radio('평균'));
    expect(radio('모듈')).toHaveAttribute('aria-disabled', 'true');
    expect(radio('모듈')).toHaveAccessibleDescription('이 지표는 이 기준으로 볼 수 없습니다');
    await user.click(add());
    expect(onAdd).not.toHaveBeenCalled();
    await user.click(radio('설비'));
    expect(add()).toBeEnabled();
  });

  it.each([{ permissions: [] }, { permissions: ['console:access'] }] satisfies { permissions: Permission[] }[])('applies the session permission to the measure ($permissions)', async ({ permissions }) => {
    const { user } = await open({ permissions });
    await user.click(radio('선'));
    const samples = radio('건수');
    if (permissions.length) expect(samples).not.toHaveAttribute('aria-disabled');
    else {
      expect(samples).toHaveAttribute('aria-disabled', 'true');
      expect(samples).toHaveAccessibleDescription('이 지표를 볼 권한이 없습니다');
      await user.click(samples);
      expect(samples).toHaveAttribute('aria-checked', 'false');
    }
  });

  it('walks the list, pin check, each radio group and Add with the keyboard', async () => {
    const { user, onAdd } = await open({ keyboard: true });
    const list = within(screen.getByRole('toolbar', { name: '이 메뉴의 패널' }));
    const detail = list.getByRole('button', { name: '상세' });
    await vi.waitFor(() => { expect(list.getByRole('button', { name: '추세' })).toHaveFocus(); });
    await user.keyboard('{ArrowDown}');
    await vi.waitFor(() => { expect(detail).toHaveFocus(); });
    expect(detail).toHaveAccessibleDescription('이 단계에서는 쓸 수 없음');
    await user.keyboard('{Enter}');
    expect(onAdd).not.toHaveBeenCalled();
    await user.tab();
    expect(screen.getByRole('checkbox')).toHaveFocus();
    await user.keyboard(' ');
    await user.tab();
    expect(radio('선')).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    await vi.waitFor(() => { expect(radio('막대')).toHaveFocus(); });
    expect(radio('막대')).toHaveAttribute('aria-checked', 'false');
    await user.keyboard('{Enter}');
    await user.tab();
    expect(radio('평균')).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    await vi.waitFor(() => { expect(radio('건수')).toHaveFocus(); });
    await user.keyboard(' {ArrowLeft}');
    await vi.waitFor(() => { expect(radio('평균')).toHaveFocus(); });
    await user.keyboard(' ');
    await user.tab();
    expect(radio('설비')).toHaveFocus();
    await user.keyboard(' ');
    // Down and Up move by chip row without changing the choice; a dimmed chip keeps focus and its reason.
    await user.keyboard('{ArrowDown}');
    await vi.waitFor(() => { expect(radio('모션')).toHaveFocus(); });
    expect(radio('모션')).toHaveAttribute('aria-disabled', 'true');
    expect(radio('모션')).toHaveAccessibleDescription();
    expect(radio('설비')).toHaveAttribute('aria-checked', 'true');
    await user.keyboard('{ArrowUp}');
    await vi.waitFor(() => { expect(radio('설비')).toHaveFocus(); });
    await user.tab();
    expect(add()).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onAdd).toHaveBeenCalledOnce();
    expect(onAdd.mock.calls[0]?.slice(0, 2)).toEqual(['chart-3', false]);
  });

  it('opens with ArrowDown like the plain menu and jumps to a row by typing its name', async () => {
    const { user } = await open({ keyboard: true, openKey: '{ArrowDown}' });
    const list = within(screen.getByRole('toolbar', { name: '이 메뉴의 패널' }));
    await vi.waitFor(() => { expect(list.getByRole('button', { name: '추세' })).toHaveFocus(); });
    await user.keyboard('상');
    await vi.waitFor(() => { expect(list.getByRole('button', { name: '상세' })).toHaveFocus(); });
    await user.keyboard('상');
    await vi.waitFor(() => { expect(list.getByRole('button', { name: '상한 초과' })).toHaveFocus(); });
    await user.tab();
    expect(screen.getByRole('checkbox')).toHaveFocus();
  });

  it('returns focus to the trigger on Escape from the chart picker', async () => {
    const { user, trigger } = await open({ keyboard: true });
    await user.click(radio('선'));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await vi.waitFor(() => { expect(trigger).toHaveFocus(); });
  });
});
