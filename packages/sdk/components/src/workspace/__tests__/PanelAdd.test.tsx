// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { House } from 'lucide-react';
import { I18nProvider, PlatformProvider, createRegistry, type MenuEntry } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId } from '@ap/contracts';
import { PanelAddMenu, usePageKeyRules, usePinnedPanels, type PanelAddItem } from '../../index';

afterEach(() => { cleanup(); });

const KNOWN = ['dist', 'scatter', 'trend'];
const menu: MenuEntry = {
  id: 'home', path: '/bars', primary: true, group: groupId('overview'), label: { ko: '막대', en: 'Bars' }, description: { ko: '', en: '' }, icon: House,
  permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'analysis',
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
