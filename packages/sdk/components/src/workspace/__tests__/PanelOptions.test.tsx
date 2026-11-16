// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { House } from 'lucide-react';
import { I18nProvider, PlatformProvider, createRegistry, type MenuEntry } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId } from '@ap/contracts';
import { PanelOptionChips, PanelOptions, changedPanelOptions, usePageKeyRules, usePanelOptions, type PanelOption } from '../../index';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const SORT: PanelOption = {
  id: 'sort', kind: 'choice', pageKey: 'barsSort', label: { ko: '정렬', en: 'Sort' }, default: 'original',
  choices: [
    { value: 'original', label: { ko: '원래 순서', en: 'Original' } },
    { value: 'total-desc', label: { ko: '합 큰 순', en: 'Largest total' } },
    { value: 'total-asc', label: { ko: '합 작은 순', en: 'Smallest total' } },
  ],
};
const GROUP: PanelOption = {
  id: 'group', kind: 'choice', pageKey: 'barsGroup', label: { ko: '묶음', en: 'Group by' }, default: 'equipment',
  choices: [{ value: 'equipment', label: { ko: '설비별', en: 'By equipment' } }, { value: 'module', label: { ko: 'Module별', en: 'By module' }, chip: { ko: 'Module로 묶음', en: 'Grouped by module' } }],
};
const ALIGN: PanelOption = { id: 'align', kind: 'toggle', pageKey: 'barsAlign', label: { ko: '시작 맞춤', en: 'Align starts' }, on: { ko: '켬', en: 'On' }, off: { ko: '끔', en: 'Off' } };
const OPTIONS = [SORT, GROUP, ALIGN];
const HIDE_GROUP = [SORT, { ...GROUP, hidden: true }, ALIGN];

const menu: MenuEntry = {
  id: 'home', path: '/bars', primary: true, group: groupId('overview'), label: { ko: '막대', en: 'Bars' }, description: { ko: '', en: '' }, icon: House,
  permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'analysis',
  features: { export: false, savedView: false, annotate: false, compare: false },
  pageKeys: ['barsSort', 'barsGroup', 'barsAlign'],
};
const registry = createRegistry({ spaces: [testSpace()], groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }], menus: [menu] });
const session = testSession(['platform:view']);

function Probe({ options = OPTIONS, collapsed = false }: { options?: readonly PanelOption[]; collapsed?: boolean }) {
  const { values, setValue, reset, rules } = usePanelOptions(options);
  const { badKeys } = usePageKeyRules(rules);
  return <section aria-label="panel">
    <PanelOptionChips options={options} values={values} onReset={reset} />
    <PanelOptions options={options} values={values} onChange={setValue} collapsed={collapsed} />
    <output data-testid="values">{JSON.stringify(values)}</output>
    <output data-testid="bad">{badKeys.join(',') || 'none'}</output>
  </section>;
}
const mount = (search = '', props: { options?: readonly PanelOption[]; collapsed?: boolean } = {}) => {
  window.history.replaceState(null, '', `/bars${search}`);
  return render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}><Probe {...props} /></PlatformProvider></I18nProvider>);
};
const params = () => new URLSearchParams(window.location.search);
const values = () => JSON.parse(screen.getByTestId('values').textContent!);
const chips = () => screen.queryByRole('list', { name: '기본과 다른 보기 설정' });

describe('PanelOptions + usePanelOptions (#2396)', () => {
  it('reads absent keys as the defaults and draws no chips', () => {
    mount();
    expect(values()).toEqual({ sort: 'original', group: 'equipment', align: false });
    expect(chips()).toBeNull();
  });

  it('draws two values as a switch, three or more as a menu, a toggle that says its state', () => {
    mount();
    expect(screen.getByRole('radiogroup', { name: '묶음' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '정렬: 원래 순서' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '시작 맞춤: 끔' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('writes a non-default value to its page key and clears the key at the default', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: '정렬: 원래 순서' }));
    await user.click(await screen.findByRole('menuitemradio', { name: '합 큰 순' }));
    expect(params().get('barsSort')).toBe('total-desc');
    fireEvent.click(screen.getByRole('button', { name: '시작 맞춤: 끔' }));
    expect(params().get('barsAlign')).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: '시작 맞춤: 켬' }));
    expect(params().has('barsAlign')).toBe(false);
    await user.click(screen.getByRole('button', { name: '정렬: 합 큰 순' }));
    await user.click(await screen.findByRole('menuitemradio', { name: '원래 순서' }));
    expect(params().has('barsSort')).toBe(false);
  });

  it('reads set keys back and shows one chip per non-default option; × returns that one to default', () => {
    mount('?barsSort=total-asc&barsGroup=module&barsAlign=1');
    expect(values()).toEqual({ sort: 'total-asc', group: 'module', align: true });
    const list = chips()!;
    expect(within(list).getAllByRole('listitem').map(item => item.textContent)).toEqual(['합 작은 순', 'Module로 묶음', '시작 맞춤']);
    fireEvent.click(within(list).getByRole('button', { name: '묶음 기본으로: Module로 묶음 해제' }));
    expect(params().has('barsGroup')).toBe(false);
    expect(params().get('barsSort')).toBe('total-asc');
    expect(values().group).toBe('equipment');
  });

  it('a hidden option is neither drawn nor chipped, and its key stays', () => {
    mount('?barsGroup=module', { options: HIDE_GROUP });
    expect(screen.queryByRole('radiogroup', { name: '묶음' })).toBeNull();
    expect(chips()).toBeNull();
    expect(params().get('barsGroup')).toBe('module');
  });

  it('reads a malformed key as the default without rewriting it, and reports it through the rules', () => {
    mount('?barsSort=sideways&barsAlign=yes');
    expect(values()).toEqual({ sort: 'original', group: 'equipment', align: false });
    expect(params().get('barsSort')).toBe('sideways');
    expect(screen.getByTestId('bad').textContent).toBe('barsSort,barsAlign');
  });

  it('folds into one «보기» menu when collapsed, with the same choices', async () => {
    const user = userEvent.setup();
    mount('', { collapsed: true });
    expect(screen.queryByRole('radiogroup', { name: '묶음' })).toBeNull();
    await user.click(screen.getByRole('button', { name: '보기' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Module별' }));
    expect(params().get('barsGroup')).toBe('module');
    await user.click(screen.getByRole('button', { name: '보기' }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: '시작 맞춤' }));
    expect(params().get('barsAlign')).toBe('1');
  });

  it('folds by the surrounding panel width against collapseBelow', () => {
    let width = 300;
    vi.stubGlobal('ResizeObserver', class { constructor(private cb: ResizeObserverCallback) {} observe(target: Element) { this.cb([{ target, contentRect: { width, height: 200 } } as ResizeObserverEntry], this as unknown as ResizeObserver); } disconnect() {} unobserve() {} });
    const { container } = render(<I18nProvider><section><PanelOptions options={OPTIONS} values={{}} onChange={() => {}} /></section></I18nProvider>);
    expect(container.querySelector('[data-panel-options]')).toHaveAttribute('data-panel-options', 'folded');
    cleanup();
    width = 600;
    const wide = render(<I18nProvider><section><PanelOptions options={OPTIONS} values={{}} onChange={() => {}} /></section></I18nProvider>);
    expect(wide.container.querySelector('[data-panel-options]')).toHaveAttribute('data-panel-options', 'inline');
  });

  it('changedPanelOptions skips hidden and default options', () => {
    expect(changedPanelOptions(HIDE_GROUP, { sort: 'total-desc', group: 'module', align: false }).map(option => option.id)).toEqual(['sort']);
  });
});
