// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
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
