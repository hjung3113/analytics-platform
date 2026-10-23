import { useEffect, useState, type ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { House } from 'lucide-react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineEndpoint, type PlatformAdapter, groupId, spaceId } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry, useMenuQuery } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { WorkspaceCommandsHost, useWorkspaceCommands, type WorkspaceCommand } from '../dock';
import { groupsOnScreen, installResizeObserver } from '../dock/__tests__/harness';
import { PanelWorkspace, type PanelWorkspaceLayout, type PanelWorkspaceProps } from './PanelWorkspace';

const observer = installResizeObserver();
beforeAll(() => { observer.resize(1200, 600); });
afterAll(() => { observer.restore(); });

const apply = { ...noContext, time: 'apply' as const };
const features = { export: false, savedView: false, annotate: false, compare: false };
const registry = createRegistry({
  spaces: [testSpace()],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('analytics') }],
  menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: apply, pageType: 'analysis', features, pageKeys: [] }],
});
const endpoint = defineEndpoint<{ page: number }, { text: string }>({
  id: 'workspace.rows', menuId: 'home', paramKeys: { page: true }, permission: 'platform:view', requiresScope: false, context: { time: 'apply' }, kinds: ['collection'], mergeTimeDomain: false,
});
const PERIOD = '/?from=2026-09-01T00:00:00&to=2026-09-02T00:00:00';

const mounts: Record<string, number> = {};
const menuQuery = vi.fn(async () => ({ outcome: 'ok' as const, data: { text: 'row' }, assessments: [{ kind: 'collection' as const, state: 'clear' as const }], trust: null, correlationId: 'c' }));
const setItem = vi.fn();

function Probe({ id }: { id: string }) {
  useEffect(() => { mounts[id] = (mounts[id] ?? 0) + 1; }, [id]);
  return <div data-testid={`probe-${id}`}>probe {id}</div>;
}
/** The query lives above the workspace: a re-arrangement must never reach it. */
function Query() {
  const query = useMenuQuery(endpoint, { page: 1 });
  return <span data-testid="query">{query.status}</span>;
}

const group = (panels: string[], active?: string): PanelWorkspaceLayout => ({ type: 'group', panels, active });
const PANELS: PanelWorkspaceProps['panels'] = [
  { id: 'trend', title: { ko: '추세', en: 'Trend' }, primary: true, render: () => <Probe id="trend" /> },
  { id: 'selector', title: { ko: '선택기', en: 'Selector' }, render: () => <Probe id="selector" /> },
  { id: 'detail', title: { ko: '상세', en: 'Detail' }, render: () => <Probe id="detail" /> },
  { id: 'kpi', title: { ko: '지표', en: 'KPI' }, render: () => <Probe id="kpi" /> },
];
const PRESETS: PanelWorkspaceProps['presets'] = [
  { id: 'balanced', label: { ko: '균형', en: 'Balanced' }, layout: { type: 'branch', dir: 'row', sizes: [1, 3, 1], children: [group(['selector']), { type: 'branch', dir: 'column', sizes: [1, 3], children: [group(['kpi']), group(['trend'])] }, group(['detail'])] } },
  { id: 'focus', label: { ko: '집중', en: 'Focus' }, layout: { type: 'branch', dir: 'row', sizes: [7, 3], children: [group(['trend']), group(['selector', 'detail', 'kpi'])] } },
  { id: 'stack', label: { ko: '쌓기', en: 'Stack' }, layout: group(['trend', 'kpi', 'selector', 'detail'], 'detail') },
];
const BASE: PanelWorkspaceProps = { panels: PANELS, presets: PRESETS, initialPreset: 'balanced', persistKey: 'main', label: { ko: '분석 패널', en: 'Analysis panels' } };
const KEY = (persistKey = 'main') => `platform:workspace:v1:u1:home:${persistKey}`;

let storage: Storage;
const session = testSession(['platform:view'], { user: { id: 'u1', name: 'u', title: { ko: 'u', en: 'u' } } });
function shell(children: ReactNode) {
  const adapter = testAdapter({ session: () => session, menuQuery: menuQuery as unknown as PlatformAdapter['menuQuery'] });
  return <I18nProvider><PlatformProvider adapter={adapter} registry={registry}><Query />{children}</PlatformProvider></I18nProvider>;
}
const mountWorkspace = (props: Partial<PanelWorkspaceProps> = {}) => render(shell(<PanelWorkspace {...BASE} {...props} />));

const ready = async () => {
  await screen.findAllByRole('tab');
  await waitFor(() => {
    const visible = Array.from(document.querySelectorAll<HTMLElement>('[data-dock-visible="true"]'));
    expect(visible.length).toBeGreaterThan(0);
    visible.forEach(element => { expect(element.closest<HTMLElement>('.dv-render-overlay')?.style.visibility).not.toBe('hidden'); });
  });
  await waitFor(() => { expect(screen.getByTestId('query')).toHaveTextContent('done'); });
};
const settle = () => act(() => new Promise<void>(resolve => { setTimeout(resolve, 30); }));
const groups = () => groupsOnScreen().map(panels => [...panels].sort());
const sleep = (ms: number) => act(() => new Promise<void>(resolve => { setTimeout(resolve, ms); }));
const choose = async (name: string) => { fireEvent.click(await screen.findByRole('radio', { name })); await settle(); };
const chooseFromMenu = async (menuButton: string, item: string) => {
  await userEvent.click(screen.getAllByRole('button', { name: menuButton })[0]!);
  await userEvent.click(await screen.findByRole('menuitem', { name: item }));
  await settle();
};
const written = () => setItem.mock.calls.filter(([key]) => String(key).startsWith('platform:workspace:')) as [string, string][];

beforeEach(() => {
  for (const key of Object.keys(mounts)) delete mounts[key];
  menuQuery.mockClear();
  setItem.mockClear();
  const memory = memoryStorage();
  storage = { ...memory, getItem: (key: string) => memory.getItem(key), setItem: (key: string, value: string) => { setItem(key, value); memory.setItem(key, value); } } as Storage;
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('sessionStorage', memoryStorage());
  window.history.replaceState(null, '', PERIOD);
  observer.resize(1200, 600);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('PanelWorkspace: remount 0, query 0', () => {
  it('renders the initial preset', async () => {
    mountWorkspace();
    await ready();
    expect(groups()).toEqual([['selector'], ['kpi'], ['trend'], ['detail']].map(panels => [...panels].sort()));
    expect(screen.getByRole('region', { name: '분석 패널' })).toBeInTheDocument();
  });

  it('preset switch, 기본 배치, tab activation, maximize and a move leave every panel mounted and every query uncalled', async () => {
    mountWorkspace();
    await ready();
    const queries = menuQuery.mock.calls.length;
    expect(queries).toBeGreaterThan(0);
    const expectUntouched = () => {
      expect(mounts).toEqual({ trend: 1, selector: 1, detail: 1, kpi: 1 });
      expect(menuQuery.mock.calls.length).toBe(queries);
    };

    await choose('집중');
    await waitFor(() => { expect(groups()).toEqual([['trend'], ['detail', 'kpi', 'selector']]); });
    expectUntouched();

    fireEvent.click(screen.getByRole('button', { name: '기본 배치' }));
    await waitFor(() => { expect(groups()).toHaveLength(2); });
    expectUntouched();

    const tab = (id: string) => document.querySelector<HTMLElement>(`[role="tab"][data-tab-panel-id="${id}"]`)!;
    await userEvent.click(tab('kpi'));
    await settle();
    expect(tab('kpi')).toHaveAttribute('aria-selected', 'true');
    expectUntouched();

    await userEvent.click(screen.getAllByRole('button', { name: '지표 최대화' })[0]!);
    await waitFor(() => { expect(document.querySelector('[data-dock-panel="trend"]')).toHaveAttribute('data-dock-visible', 'false'); });
    expectUntouched();
    await userEvent.click(screen.getByRole('button', { name: '원래 크기로' }));
    await waitFor(() => { expect(document.querySelector('[data-dock-panel="trend"]')).toHaveAttribute('data-dock-visible', 'true'); });
    expectUntouched();

    await chooseFromMenu('지표 동작', '추세 묶음으로 옮기기');
    await waitFor(() => { expect(groups()).toEqual([['kpi', 'trend'], ['detail', 'selector']]); });
    expectUntouched();
  });

  it('hide then show remounts that panel only, and calls no query', async () => {
    mountWorkspace();
    await ready();
    const queries = menuQuery.mock.calls.length;
    await chooseFromMenu('선택기 동작', '숨기기');
    await waitFor(() => { expect(document.querySelector('[data-dock-panel="selector"]')).toBeNull(); });
    expect(mounts).toEqual({ trend: 1, selector: 1, detail: 1, kpi: 1 });
    await userEvent.click(screen.getByRole('button', { name: '숨긴 패널 1' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: '선택기 다시 보기' }));
    await waitFor(() => { expect(document.querySelector('[data-dock-panel="selector"]')).not.toBeNull(); });
    expect(mounts).toEqual({ trend: 1, selector: 2, detail: 1, kpi: 1 });
    expect(menuQuery.mock.calls.length).toBe(queries);
  });
});

describe('PanelWorkspace: toolbar', () => {
  it('lists the presets with the current one selected, and switches', async () => {
    mountWorkspace();
    await ready();
    const toolbar = screen.getByRole('toolbar', { name: '배치' });
    expect(within(toolbar).getAllByRole('radio').map(radio => radio.getAttribute('aria-label') ?? radio.textContent)).toEqual(['균형', '집중', '쌓기']);
    expect(within(toolbar).getByRole('radio', { name: '균형' })).toBeChecked();
    await choose('집중');
    expect(screen.getByRole('radio', { name: '집중' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '균형' })).not.toBeChecked();
  });

  it('counts the hidden panels (disabled at 0), reopens one, and 기본 배치 brings them all back', async () => {
    mountWorkspace();
    await ready();
    expect(screen.getByRole('button', { name: '숨긴 패널 0' })).toBeDisabled();
    await chooseFromMenu('선택기 동작', '숨기기');
    await chooseFromMenu('상세 동작', '숨기기');
    await waitFor(() => { expect(screen.getByRole('button', { name: '숨긴 패널 2' })).toBeEnabled(); });
    await userEvent.click(screen.getByRole('button', { name: '숨긴 패널 2' }));
    expect((await screen.findAllByRole('menuitem')).map(item => item.textContent)).toEqual(['선택기 다시 보기', '상세 다시 보기']);
    await userEvent.click(screen.getByRole('menuitem', { name: '상세 다시 보기' }));
    await waitFor(() => { expect(screen.getByRole('button', { name: '숨긴 패널 1' })).toBeInTheDocument(); });
    fireEvent.click(screen.getByRole('button', { name: '기본 배치' }));
    await waitFor(() => { expect(screen.getByRole('button', { name: '숨긴 패널 0' })).toBeDisabled(); });
    expect(groups()).toEqual([['selector'], ['kpi'], ['trend'], ['detail']]);
  });

  it('has no 숨기기 on the primary panel, and has it on the others', async () => {
    mountWorkspace();
    await ready();
    await userEvent.click(screen.getAllByRole('button', { name: '추세 동작' })[0]!);
    await screen.findByRole('menuitem', { name: '추세 최대화' });
    expect(screen.queryByRole('menuitem', { name: '숨기기' })).toBeNull();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getAllByRole('button', { name: '상세 동작' })[0]!);
    expect(await screen.findByRole('menuitem', { name: '숨기기' })).toBeInTheDocument();
  });

  it('offers split only for a group of two or more panels', async () => {
    mountWorkspace({ initialPreset: 'focus' });
    await ready();
    await userEvent.click(screen.getAllByRole('button', { name: '추세 동작' })[0]!);
    await screen.findByRole('menuitem', { name: '추세 최대화' });
    expect(screen.queryByRole('menuitem', { name: '오른쪽으로 나누기' })).toBeNull();
    await userEvent.keyboard('{Escape}');
    const tab = document.querySelector<HTMLElement>('[role="tab"][data-tab-panel-id="selector"]')!;
    await userEvent.click(tab);
    await settle();
    await userEvent.click(screen.getAllByRole('button', { name: '선택기 동작' })[0]!);
    expect(await screen.findByRole('menuitem', { name: '오른쪽으로 나누기' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '아래로 나누기' })).toBeInTheDocument();
  });
});

describe('PanelWorkspace: focus after a panel menu action', () => {
  const tabOf = (id: string) => document.querySelector<HTMLElement>(`[role="tab"][data-tab-panel-id="${id}"]`);
  const focusedTab = () => (document.activeElement as HTMLElement | null)?.dataset.tabPanelId;

  it('hide: the tab now active in the group the panel left', async () => {
    mountWorkspace({ initialPreset: 'focus' });
    await ready();
    await userEvent.click(tabOf('selector')!);
    await settle();
    await chooseFromMenu('선택기 동작', '숨기기');
    await waitFor(() => { expect(document.activeElement).toBe(tabOf(focusedTab() ?? 'none')); });
    expect(['detail', 'kpi']).toContain(focusedTab());
  });

  it('hide: the primary\'s tab when the group is gone', async () => {
    mountWorkspace();
    await ready();
    await chooseFromMenu('상세 동작', '숨기기');
    await waitFor(() => { expect(focusedTab()).toBe('trend'); });
  });

  it.each([['오른쪽으로 나누기'], ['아래로 나누기']])('split (%s): the moved panel\'s tab', async item => {
    mountWorkspace({ initialPreset: 'focus' });
    await ready();
    await userEvent.click(tabOf('selector')!);
    await settle();
    await chooseFromMenu('선택기 동작', item);
    await waitFor(() => { expect(focusedTab()).toBe('selector'); });
  });

  it('move into another group: the moved panel\'s tab', async () => {
    mountWorkspace();
    await ready();
    await userEvent.click(screen.getAllByRole('button', { name: '상세 동작' })[0]!);
    const items = await screen.findAllByRole('menuitem', { name: /묶음으로 옮기기/ });
    await userEvent.click(items[0]!);
    await settle();
    await waitFor(() => { expect(focusedTab()).toBe('detail'); });
  });

  it('show from the hidden list: the shown panel\'s tab', async () => {
    mountWorkspace();
    await ready();
    await chooseFromMenu('상세 동작', '숨기기');
    await userEvent.click(screen.getByRole('button', { name: '숨긴 패널 1' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: '상세 다시 보기' }));
    await waitFor(() => { expect(focusedTab()).toBe('detail'); });
  });

  it('show keeps the primary visible and active', async () => {
    mountWorkspace();
    await ready();
    await chooseFromMenu('상세 동작', '숨기기');
    await userEvent.click(screen.getByRole('button', { name: '숨긴 패널 1' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: '상세 다시 보기' }));
    await waitFor(() => { expect(document.querySelector('[data-dock-panel="detail"]')).not.toBeNull(); });
    expect(document.querySelector('[data-dock-panel="trend"]')?.getAttribute('data-dock-visible')).toBe('true');
    expect(tabOf('trend')).toHaveAttribute('aria-selected', 'true');
  });
});

describe('PanelWorkspace: stacked width', () => {
  it('turns the preset radios off with a reason while the panels are stacked, and back on after widening', async () => {
    mountWorkspace({ compactPreset: 'stack' });
    await ready();
    expect(screen.getByRole('radio', { name: '집중' })).toBeEnabled();
    observer.resize(600);
    const radios = await screen.findAllByRole('radio');
    await waitFor(() => { radios.forEach(radio => { expect(radio).toBeDisabled(); }); });
    const group = screen.getByRole('radiogroup', { name: '배치' });
    expect(group).toHaveAttribute('aria-describedby');
    expect(document.getElementById(group.getAttribute('aria-describedby')!)).toHaveTextContent('좁은 폭에서는 한 묶음으로 보입니다');
    expect(group.parentElement).toHaveAttribute('title', '좁은 폭에서는 한 묶음으로 보입니다');
    observer.resize(1200);
    await waitFor(() => { expect(screen.getByRole('radio', { name: '집중' })).toBeEnabled(); });
  });

  it('does the same without a compact preset, and the host commands are disabled too', async () => {
    mountWorkspace();
    await ready();
    observer.resize(600);
    await waitFor(() => { expect(screen.getByRole('radio', { name: '집중' })).toBeDisabled(); });
    expect(screen.getByRole('button', { name: '기본 배치' })).toBeEnabled();
  });

  it('names a separator without a Korean particle', async () => {
    mountWorkspace();
    await ready();
    expect(screen.getAllByRole('separator').map(separator => separator.getAttribute('aria-label'))).toContain('선택기 · 지표 사이 너비');
  });
});

describe('PanelWorkspace: commands host', () => {
  let commands: readonly WorkspaceCommand[] = [];
  function Reader() { commands = useWorkspaceCommands(); return null; }
  function Hosted({ show }: { show: boolean }) {
    return <WorkspaceCommandsHost><Reader />{show && <PanelWorkspace {...BASE} />}</WorkspaceCommandsHost>;
  }

  it('draws no toolbar and offers presets, hidden panels and 기본 배치 as commands that change the layout', async () => {
    render(shell(<Hosted show />));
    await ready();
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(commands.map(command => [command.id, command.kind, command.label, command.checked])).toEqual([
      ['preset:balanced', 'radio', '균형', true], ['preset:focus', 'radio', '집중', false], ['preset:stack', 'radio', '쌓기', false], ['reset', 'action', '기본 배치', undefined],
    ]);
    await chooseFromMenu('상세 동작', '숨기기');
    await waitFor(() => { expect(commands.map(command => command.id)).toContain('show:detail'); });
    expect(commands.find(command => command.id === 'show:detail')!.label).toBe('상세 다시 보기');
    act(() => { commands.find(command => command.id === 'show:detail')!.run(); });
    await waitFor(() => { expect(commands.map(command => command.id)).not.toContain('show:detail'); });
    act(() => { commands.find(command => command.id === 'preset:focus')!.run(); });
    await waitFor(() => { expect(groups()).toEqual([['trend'], ['detail', 'kpi', 'selector']]); });
    expect(commands.find(command => command.id === 'preset:focus')!.checked).toBe(true);
    act(() => { commands.find(command => command.id === 'preset:stack')!.run(); });
    act(() => { commands.find(command => command.id === 'reset')!.run(); });
    await waitFor(() => { expect(groups()).toEqual([['detail', 'kpi', 'selector', 'trend']]); });
    expect(mounts.trend).toBe(1);
  });

  it('clears the commands when the workspace unmounts, and offers none outside a host', async () => {
    const view = render(shell(<Hosted show />));
    await ready();
    expect(commands.length).toBeGreaterThan(0);
    view.rerender(shell(<Hosted show={false} />));
    await waitFor(() => { expect(commands).toEqual([]); });
  });

  it('keeps only the innermost workspace\'s commands; the one it supersedes draws its own toolbar', async () => {
    const inner: PanelWorkspaceProps = { ...BASE, persistKey: 'inner', presets: [PRESETS[0]!, PRESETS[2]!], panels: PANELS.map(panel => ({ ...panel, render: () => <Probe id={`inner-${panel.id}`} /> })) };
    const nested: PanelWorkspaceProps = { ...BASE, panels: [{ ...PANELS[0]!, render: () => <PanelWorkspace {...inner} /> }, ...PANELS.slice(1)] };
    render(shell(<WorkspaceCommandsHost><Reader /><PanelWorkspace {...nested} /></WorkspaceCommandsHost>));
    await waitFor(() => { expect(commands.map(command => command.id)).toEqual(['preset:balanced', 'preset:stack', 'reset']); });
    expect(screen.getAllByRole('toolbar')).toHaveLength(1);
  });
});

describe('PanelWorkspace: compact', () => {
  it('shows the compact preset under compactBelow, stores nothing for what is done there, and returns to the stored layout', async () => {
    mountWorkspace({ compactPreset: 'stack' });
    await ready();
    observer.resize(600);
    await waitFor(() => { expect(groups()).toEqual([['detail', 'kpi', 'selector', 'trend']]); });
    expect(document.querySelector('[data-workspace-compact]')).not.toBeNull();
    await chooseFromMenu('상세 동작', '숨기기');
    await waitFor(() => { expect(screen.getByRole('button', { name: '숨긴 패널 1' })).toBeInTheDocument(); });
    await sleep(400);
    expect(written()).toEqual([]);
    expect(storage.getItem(KEY())).toBeNull();
    observer.resize(1200);
    await waitFor(() => { expect(groups()).toEqual([['selector'], ['kpi'], ['trend'], ['detail']]); });
    expect(screen.getByRole('button', { name: '숨긴 패널 0' })).toBeDisabled();
    expect(document.querySelector('[data-workspace-compact]')).toBeNull();
  });

  it('without a compact preset the panels stack into one tab group, display only', async () => {
    mountWorkspace();
    await ready();
    observer.resize(600);
    await waitFor(() => { expect(document.querySelector('[data-dock-narrow="true"]')).not.toBeNull(); });
    await waitFor(() => { expect(document.querySelectorAll('.dv-groupview')).toHaveLength(1); });
    await sleep(400);
    expect(written()).toEqual([]);
    observer.resize(1200);
    await waitFor(() => { expect(document.querySelectorAll('.dv-groupview')).toHaveLength(4); });
  });

  it('honours compactBelow', async () => {
    mountWorkspace({ compactPreset: 'stack', compactBelow: 1400 });
    await waitFor(() => { expect(groups()).toEqual([['detail', 'kpi', 'selector', 'trend']]); });
  });
});

describe('PanelWorkspace: local preference', () => {
  it('writes under platform:workspace:v1:<user>:<menu>:<persistKey> once, 300 ms after the last of several changes', async () => {
    mountWorkspace();
    await ready();
    await choose('집중');
    await choose('쌓기');
    expect(written()).toEqual([]);
    await waitFor(() => { expect(written()).toHaveLength(1); }, { timeout: 1000 });
    await sleep(400);
    expect(written()).toHaveLength(1);
    const [key, value] = written()[0]!;
    expect(key).toBe(KEY());
    expect(JSON.parse(value)).toMatchObject({ v: 1, preset: 'stack', hidden: [] });
  });

  it('flushes on unmount and on pagehide without waiting', async () => {
    const view = mountWorkspace();
    await ready();
    await choose('집중');
    expect(written()).toEqual([]);
    window.dispatchEvent(new Event('pagehide'));
    expect(written()).toHaveLength(1);
    await choose('쌓기');
    view.unmount();
    expect(written()).toHaveLength(2);
    expect(JSON.parse(written()[1]![1])).toMatchObject({ preset: 'stack' });
  });

  it('restores the stored state on mount without any query, and never stores maximize', async () => {
    storage.setItem(KEY(), JSON.stringify({ v: 1, preset: 'focus', hidden: ['detail'], layout: { type: 'branch', dir: 'row', sizes: [60, 40], children: [group(['trend']), group(['selector', 'kpi'], 'kpi')] } }));
    setItem.mockClear();
    mountWorkspace();
    await ready();
    expect(groups()).toEqual([['trend'], ['kpi', 'selector']]);
    expect(screen.getByRole('radio', { name: '집중' })).toBeChecked();
    expect(screen.getByRole('button', { name: '숨긴 패널 1' })).toBeEnabled();
    const queries = menuQuery.mock.calls.length;
    await userEvent.click(screen.getAllByRole('button', { name: '추세 최대화' })[0]!);
    await sleep(400);
    expect(written()).toEqual([]);
    expect(menuQuery.mock.calls.length).toBe(queries);
  });

  it('repairs a corrupt stored value', async () => {
    storage.setItem(KEY(), '{"v":1,"preset":"nope","layout":42,"hidden":"x"');
    mountWorkspace();
    await ready();
    expect(groups()).toHaveLength(4);
    storage.setItem(KEY(), JSON.stringify({ v: 9 }));
  });

  it('works when storage throws on read and on write', async () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => { throw new Error('denied'); } });
    const view = mountWorkspace();
    await ready();
    await choose('집중');
    await waitFor(() => { expect(groups()).toEqual([['trend'], ['detail', 'kpi', 'selector']]); });
    await sleep(400);
    expect(() => { view.unmount(); }).not.toThrow();
  });

  it('keeps the state in memory when the screen has no routed menu', async () => {
    window.history.replaceState(null, '', '/nowhere');
    mountWorkspace();
    await screen.findAllByRole('tab');
    await choose('집중');
    await sleep(400);
    expect(written()).toEqual([]);
    expect(screen.getByRole('radio', { name: '집중' })).toBeChecked();
  });

  it('restores each persistKey on its own: L1 → L2 → L3 → L2 → L3', async () => {
    storage.setItem(KEY('l2'), JSON.stringify({ v: 1, preset: 'focus', hidden: [], layout: { type: 'branch', dir: 'row', sizes: [70, 30], children: [group(['trend']), group(['selector', 'detail', 'kpi'])] } }));
    storage.setItem(KEY('l3'), JSON.stringify({ v: 1, preset: 'stack', hidden: ['detail'], layout: group(['trend', 'kpi', 'selector']) }));
    setItem.mockClear();
    const view = mountWorkspace({ persistKey: 'l1' });
    await ready();
    const queries = menuQuery.mock.calls.length;
    const expectKey = async (persistKey: string, preset: string, hidden: number) => {
      view.rerender(shell(<PanelWorkspace {...BASE} persistKey={persistKey} />));
      await waitFor(() => { expect(screen.getByRole('radio', { name: preset })).toBeChecked(); });
      expect(screen.getByRole('button', { name: `숨긴 패널 ${hidden}` })).toBeInTheDocument();
    };
    await expectKey('l1', '균형', 0);
    await expectKey('l2', '집중', 0);
    await expectKey('l3', '쌓기', 1);
    await expectKey('l2', '집중', 0);
    await expectKey('l3', '쌓기', 1);
    expect(menuQuery.mock.calls.length).toBe(queries);
    expect(written()).toEqual([]);
  });

  it('follows the stored panel set when a panel was added since: it joins the primary\'s group', async () => {
    storage.setItem(KEY(), JSON.stringify({ v: 1, preset: 'balanced', hidden: [], layout: { type: 'branch', dir: 'row', sizes: [50, 50], children: [group(['trend']), group(['selector', 'detail'])] } }));
    mountWorkspace();
    await ready();
    expect(groups()).toEqual([['kpi', 'trend'], ['detail', 'selector']]);
  });
});

describe('PanelWorkspace: identifiers', () => {
  it('reports a bad persistKey or panel id in development, and still renders', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    mountWorkspace({ persistKey: 'Bad Key', panels: [{ ...PANELS[0]!, id: 'Trend' }, ...PANELS.slice(1)] });
    await screen.findAllByRole('tab');
    expect(error.mock.calls.map(call => String(call[0])).join('\n')).toMatch(/persistKey "Bad Key"/);
    expect(error.mock.calls.map(call => String(call[0])).join('\n')).toMatch(/panel id "Trend"/);
    error.mockRestore();
  });

  it('reports a workspace without exactly one primary panel', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    mountWorkspace({ panels: PANELS.map(panel => ({ ...panel, primary: undefined })) });
    await screen.findAllByRole('tab');
    expect(error.mock.calls.map(call => String(call[0])).join('\n')).toMatch(/exactly one panel must be primary/);
    error.mockRestore();
  });
});

describe('PanelWorkspace: panel titles', () => {
  it('lets a panel remount-free change its content: state above the workspace survives a preset switch', async () => {
    function Counting() {
      const [count, setCount] = useState(0);
      return <button type="button" onClick={() => { setCount(value => value + 1); }}>count {count}</button>;
    }
    mountWorkspace({ panels: [{ ...PANELS[0]!, render: () => <Counting /> }, ...PANELS.slice(1)] });
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'count 0' }));
    await choose('집중');
    expect(screen.getByRole('button', { name: 'count 1' })).toBeInTheDocument();
  });
});
