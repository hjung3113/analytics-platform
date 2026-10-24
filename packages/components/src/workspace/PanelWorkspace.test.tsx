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
import { movePanel } from '../dock/commands';
import { PageFlowContext } from '../pageFlow';
import { PanelWorkspace, type PanelWorkspaceLayout, type PanelWorkspaceProps } from './PanelWorkspace';

// The props the workspace hands the layout, to play the engine's drop report (a real drop needs engine geometry jsdom has not).
const dockProps = vi.hoisted(() => ({ current: null as null | { layout: unknown; onLayoutChange: (layout: unknown) => void; rows?: { onPanelDrop?: (panelId: string | null) => void } } }));
vi.mock('../dock/DockLayout', async importOriginal => {
  const actual = await importOriginal<typeof import('../dock/DockLayout')>();
  return { ...actual, DockLayoutBase: (props: Parameters<typeof actual.DockLayoutBase>[0]) => { dockProps.current = props as typeof dockProps.current; return <actual.DockLayoutBase {...props} />; } };
});

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
    expect(within(within(toolbar).getByRole('radiogroup', { name: '배치' })).getAllByRole('radio').map(radio => radio.getAttribute('aria-label') ?? radio.textContent)).toEqual(['균형', '집중', '쌓기']);
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
      ['preset:balanced', 'radio', '균형', true], ['preset:focus', 'radio', '집중', false], ['preset:stack', 'radio', '쌓기', false],
      ['mode:fit', 'radio', '화면 맞춤', true], ['mode:stack', 'radio', '아래로 쌓기', false], ['reset', 'action', '기본 배치', undefined],
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
    await waitFor(() => { expect(commands.map(command => command.id)).toEqual(['preset:balanced', 'preset:stack', 'mode:fit', 'mode:stack', 'reset']); });
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

describe('PanelWorkspace: height mode (#686)', () => {
  const COLUMN: PanelWorkspaceProps['presets'][number] = {
    id: 'column', label: { ko: '세로', en: 'Column' },
    layout: { type: 'branch', dir: 'column', sizes: [1, 1, 1], children: [group(['trend']), { type: 'branch', dir: 'row', sizes: [1, 1], children: [group(['selector']), group(['detail'])] }, group(['kpi'])] },
  };
  const ROWS_PROPS: Partial<PanelWorkspaceProps> = { presets: [COLUMN, ...PRESETS], initialPreset: 'column' };
  const modeGroup = () => screen.getByRole('radiogroup', { name: '높이 방식' });
  const rowSeparators = () => Array.from(document.querySelectorAll<HTMLElement>('[data-dock-row-separator]'));
  const rowHeights = () => rowSeparators().map(separator => Number(separator.getAttribute('aria-valuenow')));
  const lastStored = () => JSON.parse(written().at(-1)![1]) as { preset: string; mode?: string; rows?: number[]; layout: { sizes: number[] } };
  const workspace = () => document.querySelector<HTMLElement>('[data-panel-workspace]')!;
  const stackStored = (rows: number[], extra: Record<string, unknown> = {}) => JSON.stringify({
    v: 1, preset: 'column', hidden: [], mode: 'stack', rows, layout: { type: 'branch', dir: 'column', sizes: [34, 33, 33], children: [group(['trend']), { type: 'branch', dir: 'row', sizes: [50, 50], children: [group(['selector']), group(['detail'])] }, group(['kpi'])] }, ...extra,
  });

  /** Seeds the stored state without counting the seeding as a write. */
  const seed = (value: string) => { storage.setItem(KEY(), value); setItem.mockClear(); };

  it('offers the mode as its own radio group beside the presets; fit is the default', async () => {
    mountWorkspace(ROWS_PROPS);
    await ready();
    expect(within(modeGroup()).getAllByRole('radio').map(radio => radio.textContent)).toEqual(['화면 맞춤', '아래로 쌓기']);
    expect(within(modeGroup()).getByRole('radio', { name: '화면 맞춤' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '세로' })).toBeChecked();
    expect(workspace()).toHaveAttribute('data-workspace-mode', 'fit');
    expect(document.querySelector('[data-dock-rows]')).toBeNull();
    expect(rowSeparators()).toEqual([]);
  });

  it('each mode says what it does in a tooltip', async () => {
    mountWorkspace(ROWS_PROPS);
    await ready();
    await userEvent.hover(within(modeGroup()).getByText('아래로 쌓기'));
    expect((await screen.findAllByText('아래로 쌓기: 줄마다 높이를 갖고 페이지가 스크롤됩니다')).length).toBeGreaterThan(0);
    await userEvent.unhover(within(modeGroup()).getByText('아래로 쌓기'));
    await userEvent.hover(within(modeGroup()).getByText('화면 맞춤'));
    expect((await screen.findAllByText('화면 맞춤: 패널이 화면 높이를 나눠 씁니다')).length).toBeGreaterThan(0);
  });

  it('switching to 아래로 쌓기 gives each row its px, stores mode and rows, keeps the preset, and remounts and queries nothing; switching back is fit again', async () => {
    mountWorkspace(ROWS_PROPS);
    await ready();
    const queries = menuQuery.mock.calls.length;
    await choose('아래로 쌓기');
    await waitFor(() => { expect(workspace()).toHaveAttribute('data-workspace-mode', 'stack'); });
    // Fit gave 600 px; three rows need 3 x 360: the entering height is the larger one, split by share.
    expect(rowHeights()).toEqual([360, 360, 360]);
    expect(document.querySelector<HTMLElement>('[data-dock-rows]')!.style.getPropertyValue('--dock-rows-height')).toBe('1080px');
    expect(screen.getByRole('radio', { name: '세로' })).toBeChecked();
    await sleep(400);
    expect(lastStored()).toMatchObject({ preset: 'column', mode: 'stack', rows: [360, 360, 360] });
    expect(mounts).toEqual({ trend: 1, selector: 1, detail: 1, kpi: 1 });
    await choose('화면 맞춤');
    await waitFor(() => { expect(workspace()).toHaveAttribute('data-workspace-mode', 'fit'); });
    expect(document.querySelector('[data-dock-rows]')).toBeNull();
    await sleep(400);
    expect(lastStored().mode).toBeUndefined();
    expect(lastStored().rows).toBeUndefined();
    expect(mounts).toEqual({ trend: 1, selector: 1, detail: 1, kpi: 1 });
    expect(menuQuery.mock.calls.length).toBe(queries);
  });

  it('restores a stored stack workspace at once: rows in px, no mode switch needed', async () => {
    storage.setItem(KEY(), stackStored([300, 400, 500]));
    mountWorkspace(ROWS_PROPS);
    await ready();
    expect(workspace()).toHaveAttribute('data-workspace-mode', 'stack');
    expect(rowHeights()).toEqual([300, 400, 500]);
    expect(within(modeGroup()).getByRole('radio', { name: '아래로 쌓기' })).toBeChecked();
    expect(document.querySelector<HTMLElement>('[data-dock-rows]')!.style.getPropertyValue('--dock-rows-height')).toBe('1200px');
  });

  it('restored rows obey the visible-height cap once; a later window resize never rewrites them', async () => {
    vi.stubGlobal('innerHeight', 600);
    try {
      seed(stackStored([800, 360, 360]));
      mountWorkspace(ROWS_PROPS);
      await ready();
      await waitFor(() => { expect(rowHeights()).toEqual([600, 360, 360]); });
      await sleep(400);
      expect(lastStored().rows).toEqual([600, 360, 360]);
      const writes = written().length;
      vi.stubGlobal('innerHeight', 300);
      fireEvent(window, new Event('resize'));
      await settle();
      expect(rowHeights()).toEqual([600, 360, 360]);
      await sleep(400);
      expect(written().length).toBe(writes);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('a stored stack mode with unusable rows measures them before showing (no fit was shown: the visible height less the toolbar is the baseline)', async () => {
    storage.setItem(KEY(), stackStored([300, 400]));
    mountWorkspace(ROWS_PROPS);
    await ready();
    expect(workspace()).toHaveAttribute('data-workspace-mode', 'stack');
    // 3 rows need 3 x 360 = 1080 > the baseline, which is split by the stored shares 34 / 33 / 33.
    expect(rowHeights()).toEqual([367, 356, 356]);
  });

  it('a separator key resizes only the row above and the stored rows follow', async () => {
    storage.setItem(KEY(), stackStored([300, 400, 500]));
    mountWorkspace(ROWS_PROPS);
    await ready();
    rowSeparators()[0]!.focus();
    await userEvent.keyboard('{ArrowDown}');
    await waitFor(() => { expect(rowHeights()).toEqual([324, 400, 500]); });
    await sleep(400);
    expect(lastStored().rows).toEqual([324, 400, 500]);
    expect(document.querySelector<HTMLElement>('[data-dock-rows]')!.style.getPropertyValue('--dock-rows-height')).toBe('1224px');
  });

  it('기본 배치 derives the rows from the preset and the fit height, so repeating it never adds height', async () => {
    storage.setItem(KEY(), stackStored([300, 400, 900]));
    mountWorkspace(ROWS_PROPS);
    await ready();
    fireEvent.click(screen.getByRole('button', { name: '기본 배치' }));
    await waitFor(() => { expect(rowHeights()).toEqual([360, 360, 360]); });
    fireEvent.click(screen.getByRole('button', { name: '기본 배치' }));
    await settle();
    expect(rowHeights()).toEqual([360, 360, 360]);
  });

  it('a preset in stack mode re-enters the rows from the new shares and the height fit mode gave', async () => {
    mountWorkspace(ROWS_PROPS);
    await ready();
    await choose('아래로 쌓기');
    await choose('집중');
    await waitFor(() => { expect(rowHeights()).toEqual([600]); });
    await choose('세로');
    await waitFor(() => { expect(rowHeights()).toEqual([360, 360, 360]); });
  });

  it('아래 새 줄로 옮기기 adds a 360 row, keeps the others, and is absent for a panel alone in the last row', async () => {
    storage.setItem(KEY(), stackStored([300, 400, 500]));
    mountWorkspace(ROWS_PROPS);
    await ready();
    await userEvent.click(screen.getAllByRole('button', { name: '선택기 동작' })[0]!);
    await userEvent.click(await screen.findByRole('menuitem', { name: '아래 새 줄로 옮기기' }));
    await waitFor(() => { expect(rowHeights()).toEqual([300, 400, 500, 360]); });
    expect(document.querySelector<HTMLElement>('[data-dock-rows]')!.style.getPropertyValue('--dock-rows-height')).toBe('1560px');
    await userEvent.click(screen.getAllByRole('button', { name: '선택기 동작' })[0]!);
    expect(screen.queryByRole('menuitem', { name: '아래 새 줄로 옮기기' })).toBeNull();
    await userEvent.keyboard('{Escape}');
    // A panel in an earlier row still can move below.
    await userEvent.click(screen.getAllByRole('button', { name: '추세 동작' })[0]!);
    expect(await screen.findByRole('menuitem', { name: '아래 새 줄로 옮기기' })).toBeInTheDocument();
  });

  describe('the engine\'s own drag carries the moved panel (the layout alone cannot say which panel moved)', () => {
    const engineDrop = (panelId: string, position: 'top' | 'center', onto: string) => {
      const props = dockProps.current!;
      act(() => {
        props.rows!.onPanelDrop!(panelId);
        props.onLayoutChange(movePanel(props.layout as Parameters<typeof movePanel>[0], panelId, { panelId: onto, position }));
      });
    };

    it('a tab dragged above the first row is a new first row of 360; the other rows keep their px', async () => {
      storage.setItem(KEY(), stackStored([300, 400, 500]));
      mountWorkspace(ROWS_PROPS);
      await ready();
      engineDrop('kpi', 'top', 'trend');
      await waitFor(() => { expect(rowHeights()).toEqual([360, 300, 400]); });
    });

    it('a tab dragged out of a shared row to the top: 360 above, the row it left keeps its px', async () => {
      storage.setItem(KEY(), stackStored([300, 400, 500]));
      mountWorkspace(ROWS_PROPS);
      await ready();
      engineDrop('selector', 'top', 'trend');
      await waitFor(() => { expect(rowHeights()).toEqual([360, 300, 400, 500]); });
    });

    it('a drop into the tabs of another row makes no row: the emptied row goes and the others keep their px', async () => {
      storage.setItem(KEY(), stackStored([300, 400, 500]));
      mountWorkspace(ROWS_PROPS);
      await ready();
      engineDrop('kpi', 'center', 'trend');
      await waitFor(() => { expect(rowHeights()).toEqual([300, 400]); });
    });

    it('is used once: a later layout report without a drop of its own carries no moved panel', async () => {
      storage.setItem(KEY(), stackStored([300, 400, 500]));
      mountWorkspace(ROWS_PROPS);
      await ready();
      engineDrop('kpi', 'center', 'trend');
      await waitFor(() => { expect(rowHeights()).toEqual([300, 400]); });
      // No drop was reported for this one: with a stale `kpi` it would be the new 360 row at the top; without, the earlier row keeps the shared 300.
      const props = dockProps.current!;
      act(() => { props.onLayoutChange(movePanel(props.layout as Parameters<typeof movePanel>[0], 'kpi', { panelId: 'trend', position: 'top' })); });
      await waitFor(() => { expect(rowHeights()).toEqual([300, 360, 400]); });
    });
  });

  it('is not offered in fit mode', async () => {
    mountWorkspace(ROWS_PROPS);
    await ready();
    await userEvent.click(screen.getAllByRole('button', { name: '선택기 동작' })[0]!);
    await screen.findByRole('menuitem', { name: '숨기기' });
    expect(screen.queryByRole('menuitem', { name: '아래 새 줄로 옮기기' })).toBeNull();
  });

  it('hiding the only panel of a row removes the row and shrinks the workspace; the other rows keep their px', async () => {
    storage.setItem(KEY(), stackStored([300, 400, 500]));
    mountWorkspace(ROWS_PROPS);
    await ready();
    await chooseFromMenu('지표 동작', '숨기기');
    await waitFor(() => { expect(rowHeights()).toEqual([300, 400]); });
    expect(document.querySelector<HTMLElement>('[data-dock-rows]')!.style.getPropertyValue('--dock-rows-height')).toBe('700px');
  });

  it('narrow: stack is inactive and the mode radios are off with the reason; the stored mode and rows survive and return on widening', async () => {
    seed(stackStored([300, 400, 500]));
    mountWorkspace(ROWS_PROPS);
    await ready();
    observer.resize(600);
    await waitFor(() => { expect(workspace()).toHaveAttribute('data-workspace-mode', 'fit'); });
    expect(document.querySelector('[data-dock-rows]')).toBeNull();
    within(modeGroup()).getAllByRole('radio').forEach(radio => { expect(radio).toBeDisabled(); });
    expect(document.getElementById(modeGroup().getAttribute('aria-describedby')!)).toHaveTextContent('좁은 폭에서는 화면 맞춤으로 보입니다');
    await sleep(400);
    expect(written()).toEqual([]);
    observer.resize(1200);
    await waitFor(() => { expect(workspace()).toHaveAttribute('data-workspace-mode', 'stack'); });
    expect(rowHeights()).toEqual([300, 400, 500]);
  });

  it('a compact preset edited while narrow never replaces the stored mode and rows', async () => {
    seed(stackStored([300, 400, 500]));
    mountWorkspace({ ...ROWS_PROPS, compactPreset: 'stack' });
    await ready();
    observer.resize(600);
    await waitFor(() => { expect(workspace()).toHaveAttribute('data-workspace-mode', 'fit'); });
    await chooseFromMenu('상세 동작', '숨기기');
    expect(screen.queryByRole('tab', { name: '상세' })).toBeNull();
    await sleep(400);
    expect(written()).toEqual([]);
    observer.resize(1200);
    await waitFor(() => { expect(rowHeights()).toEqual([300, 400, 500]); });
  });

  it('tells the page it is in flow only while stack shows', async () => {
    const register = vi.fn();
    const unregister = vi.fn();
    register.mockImplementation(() => unregister);
    storage.setItem(KEY(), stackStored([300, 400, 500]));
    const view = render(shell(<PageFlowContext.Provider value={register}><PanelWorkspace {...BASE} {...ROWS_PROPS} /></PageFlowContext.Provider>));
    await ready();
    expect(register).toHaveBeenCalledTimes(1);
    await choose('화면 맞춤');
    expect(unregister).toHaveBeenCalledTimes(1);
    await choose('아래로 쌓기');
    expect(register).toHaveBeenCalledTimes(2);
    view.unmount();
    expect(unregister).toHaveBeenCalledTimes(2);
  });
});

describe('PanelWorkspace: initialMode (#690)', () => {
  const COLUMN: PanelWorkspaceProps['presets'][number] = {
    id: 'column', label: { ko: '세로', en: 'Column' },
    layout: { type: 'branch', dir: 'column', sizes: [1, 1, 1], children: [group(['trend']), { type: 'branch', dir: 'row', sizes: [1, 1], children: [group(['selector']), group(['detail'])] }, group(['kpi'])] },
  };
  const PROPS: Partial<PanelWorkspaceProps> = { presets: [COLUMN, ...PRESETS], initialPreset: 'column' };
  const workspace = () => document.querySelector<HTMLElement>('[data-panel-workspace]')!;
  const modeGroup = () => screen.getByRole('radiogroup', { name: '높이 방식' });
  const saved = (extra: Record<string, unknown> = {}) => JSON.stringify({
    v: 1, preset: 'column', hidden: [], layout: { type: 'branch', dir: 'column', sizes: [34, 33, 33], children: [group(['trend']), { type: 'branch', dir: 'row', sizes: [50, 50], children: [group(['selector']), group(['detail'])] }, group(['kpi'])] }, ...extra,
  });

  it('an untouched workspace starts in 아래로 쌓기 with its rows measured', async () => {
    mountWorkspace({ ...PROPS, initialMode: 'stack' });
    await ready();
    expect(workspace()).toHaveAttribute('data-workspace-mode', 'stack');
    expect(within(modeGroup()).getByRole('radio', { name: '아래로 쌓기' })).toBeChecked();
    expect(document.querySelectorAll('[data-dock-row-separator]')).toHaveLength(3);
  });

  it('without initialMode, or with initialMode fit, it starts fitted as before', async () => {
    mountWorkspace(PROPS);
    await ready();
    expect(workspace()).toHaveAttribute('data-workspace-mode', 'fit');
    cleanup();
    mountWorkspace({ ...PROPS, initialMode: 'fit' });
    await ready();
    expect(workspace()).toHaveAttribute('data-workspace-mode', 'fit');
  });

  it('a saved fit wins over initialMode, and so does a saved value written before modes existed', async () => {
    storage.setItem(KEY(), saved());
    mountWorkspace({ ...PROPS, initialMode: 'stack' });
    await ready();
    expect(workspace()).toHaveAttribute('data-workspace-mode', 'fit');
    expect(within(modeGroup()).getByRole('radio', { name: '화면 맞춤' })).toBeChecked();
  });

  it('narrow: fit shows, the stored mode is untouched, and stack returns on widening; 기본 배치 keeps the mode', async () => {
    mountWorkspace({ ...PROPS, initialMode: 'stack' });
    await ready();
    observer.resize(600);
    await waitFor(() => { expect(workspace()).toHaveAttribute('data-workspace-mode', 'fit'); });
    expect(document.querySelector('[data-dock-rows]')).toBeNull();
    await sleep(400);
    expect(written().every(([, value]) => (JSON.parse(value) as { mode?: string }).mode === 'stack')).toBe(true);
    observer.resize(1200);
    await waitFor(() => { expect(workspace()).toHaveAttribute('data-workspace-mode', 'stack'); });
    fireEvent.click(screen.getByRole('button', { name: '기본 배치' }));
    await settle();
    expect(workspace()).toHaveAttribute('data-workspace-mode', 'stack');
    await choose('화면 맞춤');
    fireEvent.click(screen.getByRole('button', { name: '기본 배치' }));
    await settle();
    expect(workspace()).toHaveAttribute('data-workspace-mode', 'fit');
  });
});

describe('PanelWorkspace: revealRequest (#690)', () => {
  const tab = (id: string) => document.querySelector<HTMLElement>(`[role="tab"][data-tab-panel-id="${id}"]`)!;
  const FOCUS_PROPS: Partial<PanelWorkspaceProps> = { initialPreset: 'focus' };
  /** Re-renders the same tree with a new request: the workspace stays mounted. */
  const withRequest = (request: PanelWorkspaceProps['revealRequest'], extra: Partial<PanelWorkspaceProps> = {}) => shell(<PanelWorkspace {...BASE} {...FOCUS_PROPS} {...extra} revealRequest={request} />);

  it('makes the panel the active tab of its group without remounting any panel or reading again', async () => {
    const view = render(withRequest(null));
    await ready();
    const queries = menuQuery.mock.calls.length;
    expect(tab('selector')).toHaveAttribute('aria-selected', 'true');
    view.rerender(withRequest({ panelId: 'kpi', seq: 1 }));
    await waitFor(() => { expect(tab('kpi')).toHaveAttribute('aria-selected', 'true'); });
    expect(tab('selector')).toHaveAttribute('aria-selected', 'false');
    expect(mounts).toEqual({ trend: 1, selector: 1, detail: 1, kpi: 1 });
    expect(menuQuery.mock.calls.length).toBe(queries);
    await sleep(400);
    expect(JSON.stringify(JSON.parse(written().at(-1)![1]).layout)).toContain('"active":"kpi"');
  });

  it('does nothing for the same seq, null, an unknown panel (development diagnostic) and a request present on mount', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const view = render(withRequest({ panelId: 'kpi', seq: 1 }));
    await ready();
    expect(tab('selector')).toHaveAttribute('aria-selected', 'true');
    view.rerender(withRequest({ panelId: 'kpi', seq: 2 }));
    await waitFor(() => { expect(tab('kpi')).toHaveAttribute('aria-selected', 'true'); });
    await userEvent.click(tab('detail'));
    await settle();
    view.rerender(withRequest({ panelId: 'kpi', seq: 2 }));
    view.rerender(withRequest(null));
    await settle();
    expect(tab('detail')).toHaveAttribute('aria-selected', 'true');
    view.rerender(withRequest({ panelId: 'nope', seq: 3 }));
    await settle();
    expect(tab('detail')).toHaveAttribute('aria-selected', 'true');
    expect(error.mock.calls.some(([message]) => String(message).includes('"nope"'))).toBe(true);
    error.mockRestore();
  });

  it('a hidden panel stays hidden', async () => {
    const view = render(withRequest(null));
    await ready();
    await chooseFromMenu('선택기 동작', '숨기기');
    await waitFor(() => { expect(document.querySelector('[role="tab"][data-tab-panel-id="selector"]')).toBeNull(); });
    view.rerender(withRequest({ panelId: 'selector', seq: 1 }));
    await settle();
    expect(document.querySelector('[role="tab"][data-tab-panel-id="selector"]')).toBeNull();
    expect(screen.getByRole('button', { name: '숨긴 패널 1' })).toBeEnabled();
  });

  it('while another panel is maximized it is a no-op: the maximize is kept and the request is not queued', async () => {
    const view = render(withRequest(null));
    await ready();
    await userEvent.click(screen.getAllByRole('button', { name: '추세 최대화' })[0]!);
    await waitFor(() => { expect(document.querySelector('[data-dock-panel="selector"]')).toHaveAttribute('data-dock-visible', 'false'); });
    view.rerender(withRequest({ panelId: 'kpi', seq: 1 }));
    await settle();
    expect(screen.getByRole('button', { name: '원래 크기로' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '원래 크기로' }));
    await settle();
    expect(tab('selector')).toHaveAttribute('aria-selected', 'true');
    expect(tab('kpi')).toHaveAttribute('aria-selected', 'false');
  });

  it('never moves focus', async () => {
    const view = render(withRequest(null));
    await ready();
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    view.rerender(withRequest({ panelId: 'kpi', seq: 1 }));
    await waitFor(() => { expect(tab('kpi')).toHaveAttribute('aria-selected', 'true'); });
    await settle();
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it('works the same inside the board host', async () => {
    const hosted = (request: PanelWorkspaceProps['revealRequest']) => shell(<WorkspaceCommandsHost><PanelWorkspace {...BASE} {...FOCUS_PROPS} revealRequest={request} /></WorkspaceCommandsHost>);
    const view = render(hosted(null));
    await ready();
    view.rerender(hosted({ panelId: 'detail', seq: 1 }));
    await waitFor(() => { expect(tab('detail')).toHaveAttribute('aria-selected', 'true'); });
    expect(mounts).toEqual({ trend: 1, selector: 1, detail: 1, kpi: 1 });
  });

  describe('narrow without a compact preset (one tab group)', () => {
    const panel = (id: string) => document.querySelector<HTMLElement>(`[data-dock-panel="${id}"]`)!;
    const shownNarrow = async (id: string) => {
      await waitFor(() => { expect(tab(id)).toHaveAttribute('aria-selected', 'true'); });
      expect(panel(id)).toHaveAttribute('data-dock-visible', 'true');
    };
    const hosted = (request: PanelWorkspaceProps['revealRequest']) => shell(<WorkspaceCommandsHost><PanelWorkspace {...BASE} {...FOCUS_PROPS} revealRequest={request} /></WorkspaceCommandsHost>);

    it('standalone: the target becomes the shown panel, also when it is already active in its own group', async () => {
      const view = render(withRequest(null));
      await ready();
      observer.resize(600);
      await shownNarrow('trend');
      view.rerender(withRequest({ panelId: 'kpi', seq: 1 }));
      await shownNarrow('kpi');
      expect(panel('trend')).toHaveAttribute('data-dock-visible', 'false');
      // `selector` is the active tab of its original group, yet background in the narrow group.
      view.rerender(withRequest({ panelId: 'selector', seq: 2 }));
      await shownNarrow('selector');
      expect(mounts).toEqual({ trend: 1, selector: 1, detail: 1, kpi: 1 });
    });

    it('inside the board host', async () => {
      const view = render(hosted(null));
      await ready();
      observer.resize(600);
      await shownNarrow('trend');
      view.rerender(hosted({ panelId: 'detail', seq: 1 }));
      await shownNarrow('detail');
    });

    it('after the user picked another panel, a new reveal switches to the target and a later pick still works', async () => {
      const view = render(withRequest(null));
      await ready();
      observer.resize(600);
      await shownNarrow('trend');
      await userEvent.click(tab('detail'));
      await shownNarrow('detail');
      view.rerender(withRequest({ panelId: 'kpi', seq: 1 }));
      await shownNarrow('kpi');
      await userEvent.click(tab('selector'));
      await shownNarrow('selector');
    });

    it('a hidden panel stays hidden and focus stays outside', async () => {
      const view = render(withRequest(null));
      await ready();
      await chooseFromMenu('선택기 동작', '숨기기');
      await waitFor(() => { expect(tab('selector')).toBeNull(); });
      observer.resize(600);
      const outside = document.createElement('button');
      document.body.append(outside);
      outside.focus();
      view.rerender(withRequest({ panelId: 'selector', seq: 1 }));
      await settle();
      expect(tab('selector')).toBeNull();
      expect(document.activeElement).toBe(outside);
      outside.remove();
    });

    it('wide stays unchanged: the target is active in its own group only', async () => {
      const view = render(withRequest(null));
      await ready();
      view.rerender(withRequest({ panelId: 'kpi', seq: 1 }));
      await waitFor(() => { expect(tab('kpi')).toHaveAttribute('aria-selected', 'true'); });
      expect(tab('trend')).toHaveAttribute('aria-selected', 'true');
      expect(document.querySelector('[data-dock-narrow="true"]')).toBeNull();
    });
  });
});
