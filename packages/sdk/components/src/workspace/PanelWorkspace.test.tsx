import { AnalysisChartFrame } from '../chart/AnalysisChartFrame';
import { PageDensityProvider } from '../pageDensity';
import { StrictMode, useEffect, useState, type ReactNode } from 'react';
import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { House } from 'lucide-react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineEndpoint, type PlatformAdapter, groupId, spaceId } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry, useMenuQuery } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { WorkspaceCommandsHost, useWorkspaceCommands, type WorkspaceCommand } from '../dock';
import { groupsOnScreen, installResizeObserver } from '../dock/__tests__/harness';
import { movePanel } from '../dock/commands';
import { PageFlowContext } from '../pageFlow';
import { PanelSettingsDrawer } from './PanelSettingsDrawer';
import { PanelWorkspace, type PanelWorkspaceLayout, type PanelWorkspaceProps } from './PanelWorkspace';

vi.mock('../chart/EChartImpl', () => ({ default: () => <div role="img" aria-label="plot" /> }));

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
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
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
const BASE: PanelWorkspaceProps = { panels: PANELS, presets: PRESETS, initialPreset: 'balanced', initialMode: 'fit', persistKey: 'main', label: { ko: '작업 영역 패널', en: 'Analysis panels' } };
const KEY = (persistKey = 'main') => `platform:workspace:v1:u1:home:${persistKey}`;

let storage: Storage;
const session = testSession(['platform:view'], { user: { id: 'u1', name: 'u', title: { ko: 'u', en: 'u' } } });
// One adapter for every render of a test: a new adapter object is a new session generation and reads again (ADR-0086).
const adapter = testAdapter({ session: () => session, menuQuery: menuQuery as unknown as PlatformAdapter['menuQuery'] });
function shell(children: ReactNode) {
  return <I18nProvider><PlatformProvider adapter={adapter} registry={registry}><Query />{children}</PlatformProvider></I18nProvider>;
}
const mountWorkspace = (props: Partial<PanelWorkspaceProps> = {}) => render(shell(<PanelWorkspace {...BASE} {...props} />));

it.each(['ko', 'en'] as const)('appends translated %s menu declarations on a primary panel after platform actions, selects by keyboard and returns focus', async lang => {
  // The cold DockEngine import runs on the real clock. This menu test has no timer-driven assertions.
  vi.useRealTimers();
  const selected = vi.fn();
  storage.setItem('platform:lang', lang);
  mountWorkspace({ panels: PANELS.map(panel => ({ ...panel, primary: panel.id === 'selector' })), panelMenuItems: () => [{ id: 'recipe', label: { ko: '만든 방법', en: 'Recipe' }, onSelect: selected }] });
  await ready();
  const label = lang === 'ko' ? '선택기 동작' : 'Selector actions';
  const trigger = screen.getByRole('button', { name: label });
  await userEvent.click(trigger);
  const item = await screen.findByRole('menuitem', { name: lang === 'ko' ? '만든 방법' : 'Recipe' });
  expect(screen.queryByRole('menuitem', { name: lang === 'ko' ? 'Recipe' : '만든 방법' })).toBeNull();
  expect(item.previousElementSibling).toHaveAttribute('role', 'separator');
  const items = screen.getAllByRole('menuitem');
  expect(items.at(-1)).toBe(item);
  item.focus();
  await userEvent.keyboard('{Enter}');
  expect(selected).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(trigger).toHaveFocus());
});

const ready = async () => {
  await screen.findAllByRole('tab');
  await waitFor(() => {
    const visible = Array.from(document.querySelectorAll<HTMLElement>('[data-dock-visible="true"]'));
    expect(visible.length).toBeGreaterThan(0);
    visible.forEach(element => { expect(element.closest<HTMLElement>('.dv-render-overlay')?.style.visibility).not.toBe('hidden'); });
  });
  await waitFor(() => { expect(screen.getByTestId('query')).toHaveTextContent('done'); });
};
// Fake timers that also follow the real clock keep `waitFor` and `userEvent` working while the persist debounce is stepped through virtual time.
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const settle = () => advance(30);
const groups = () => groupsOnScreen().map(panels => [...panels].sort());
const sleep = advance;
/** The height mode lives in the toolbar's `⋯` menu (ADR-0130): opens it when it is not open and returns the item. */
const modeItem = async (name: string) => {
  if (!screen.queryByRole('menuitemradio', { name })) await userEvent.click(screen.getByRole('button', { name: '높이 방식' }));
  return screen.findByRole('menuitemradio', { name });
};
const choose = async (name: string) => {
  if (name === '화면 맞춤' || name === '아래로 쌓기') await userEvent.click(await modeItem(name));
  else fireEvent.click(await screen.findByRole('radio', { name }));
  await settle();
};
const chooseFromMenu = async (menuButton: string, item: string) => {
  await userEvent.click(screen.getAllByRole('button', { name: menuButton })[0]!);
  await userEvent.click(await screen.findByRole('menuitem', { name: item }));
  await settle();
};
const written = () => setItem.mock.calls.filter(([key]) => String(key).startsWith('platform:workspace:')) as [string, string][];

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  // Polling under fake timers spends virtual time, so the first (cold) mount needs a wider virtual budget than the real 1000 ms.
  configure({ asyncUtilTimeout: 10_000 });
  vi.stubGlobal('jest', { advanceTimersByTime: (ms: number) => { vi.advanceTimersByTime(ms); } });
  for (const key of Object.keys(mounts)) delete mounts[key];
  menuQuery.mockClear();
  setItem.mockClear();
  const memory = memoryStorage();
  storage = { ...memory, get length() { return memory.length; }, getItem: (key: string) => memory.getItem(key), setItem: (key: string, value: string) => { setItem(key, value); memory.setItem(key, value); } } as Storage;
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('sessionStorage', memoryStorage());
  window.history.replaceState(null, '', PERIOD);
  observer.resize(1200, 600);
});
afterEach(() => { cleanup(); vi.useRealTimers(); configure({ asyncUtilTimeout: 1000 }); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('PanelWorkspace: remount 0, query 0', () => {
  it('renders the initial preset', async () => {
    mountWorkspace();
    await ready();
    expect(groups()).toEqual([['selector'], ['kpi'], ['trend'], ['detail']].map(panels => [...panels].sort()));
    expect(screen.getByRole('region', { name: '작업 영역 패널' })).toBeInTheDocument();
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

  it('deletes a consumer-owned panel and returns focus to the primary', async () => {
    function RemovableWorkspace() {
      const [panels, setPanels] = useState(PANELS);
      return <PanelWorkspace {...BASE} panels={panels.map(panel => panel.id === 'selector'
        ? { ...panel, onRemove: () => setPanels(current => current.filter(item => item.id !== panel.id)) }
        : panel)} />;
    }
    render(shell(<RemovableWorkspace />));
    await ready();
    await chooseFromMenu('선택기 동작', '삭제');
    expect(screen.queryByRole('tab', { name: '선택기' })).toBeNull();
    expect(screen.getByRole('button', { name: '숨긴 패널 0' })).toBeDisabled();
    await waitFor(() => expect(screen.getByRole('tab', { name: '추세' })).toHaveFocus());
  });

  it('does not offer delete on a declared panel or on the primary panel', async () => {
    mountWorkspace({ panels: PANELS.map(panel => panel.primary || panel.id === 'selector' ? { ...panel, onRemove: vi.fn() } : panel) });
    await ready();
    await userEvent.click(screen.getByRole('button', { name: '추세 동작' }));
    await screen.findByRole('menuitem', { name: '추세 최대화' });
    expect(screen.queryByRole('menuitem', { name: '삭제' })).toBeNull();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: '상세 동작' }));
    expect(await screen.findByRole('menuitem', { name: '숨기기' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: '삭제' })).toBeNull();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: '선택기 동작' }));
    expect(await screen.findByRole('menuitem', { name: '삭제' })).toBeInTheDocument();
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

  it('restores adjusted widths for the same slot in each preference scope', async () => {
    const view = mountWorkspace({ persistenceScope: 'first', initialPreset: 'focus' });
    await ready();
    const width = () => screen.getByRole('separator').getAttribute('aria-valuenow');
    const initial = width();
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowRight' });
    await waitFor(() => expect(width()).not.toBe(initial));
    const adjusted = width();

    view.rerender(shell(<PanelWorkspace {...BASE} persistenceScope="second" initialPreset="focus" />));
    await ready();
    expect(width()).toBe(initial);
    view.rerender(shell(<PanelWorkspace {...BASE} persistenceScope="first" initialPreset="focus" />));
    await ready();
    expect(width()).toBe(adjusted);
  });

  it('retains only the eight most recently written scopes for this workspace', async () => {
    const view = mountWorkspace({ persistenceScope: 'scope-0' });
    const at = async (scope: string, persistKey = 'main') => {
      view.rerender(shell(<PanelWorkspace {...BASE} persistenceScope={scope} persistKey={persistKey} />));
      await ready();
    };
    await ready();
    await choose('집중');
    await at('other', 'other');
    await choose('집중');
    for (let index = 1; index < 8; index++) {
      await at(`scope-${index}`);
      await choose('집중');
    }
    await at('scope-0');
    await choose('쌓기');
    await at('scope-8');
    await choose('집중');
    await sleep(400);

    await at('scope-1');
    expect(screen.getByRole('radio', { name: '균형' })).toBeChecked();
    await at('scope-0');
    expect(screen.getByRole('radio', { name: '쌓기' })).toBeChecked();
    await at('scope-2');
    expect(screen.getByRole('radio', { name: '집중' })).toBeChecked();
    await at('other', 'other');
    expect(screen.getByRole('radio', { name: '집중' })).toBeChecked();
  });

  it('per drill step (#2397): each step declares its own panels, presets and persistKey; a step-only panel never shows elsewhere and each step restores its own layout', async () => {
    // Step 1 has no detail panel (it cannot answer there); step 2 adds it and arranges differently.
    const STEP1: Partial<PanelWorkspaceProps> = { persistKey: 'step1', panels: PANELS.filter(panel => panel.id !== 'detail'), presets: [{ id: 'balanced', label: { ko: '균형', en: 'Balanced' }, layout: { type: 'branch', dir: 'row', sizes: [1, 2], children: [group(['selector']), group(['trend', 'kpi'])] } }] };
    const STEP2: Partial<PanelWorkspaceProps> = { persistKey: 'step2', panels: PANELS, presets: [PRESETS[1]!], initialPreset: 'focus' };
    storage.setItem(KEY('step2'), JSON.stringify({ v: 1, preset: 'focus', hidden: ['kpi'], layout: { type: 'branch', dir: 'row', sizes: [60, 40], children: [group(['trend']), group(['selector', 'detail'])] } }));
    setItem.mockClear();
    const view = mountWorkspace(STEP1);
    await ready();
    const queries = menuQuery.mock.calls.length;
    const atStep = async (step: Partial<PanelWorkspaceProps>, expected: string[][]) => {
      view.rerender(shell(<PanelWorkspace {...BASE} {...step} />));
      await waitFor(() => { expect(groups()).toEqual(expected); });
    };
    await atStep(STEP1, [['selector'], ['kpi', 'trend']]);
    expect(screen.queryByRole('tab', { name: /상세/ })).toBeNull();
    await atStep(STEP2, [['trend'], ['detail', 'selector']]);
    expect(screen.getByRole('button', { name: '숨긴 패널 1' })).toBeInTheDocument();
    await atStep(STEP1, [['selector'], ['kpi', 'trend']]);
    expect(screen.queryByRole('tab', { name: /상세/ })).toBeNull();
    await atStep(STEP2, [['trend'], ['detail', 'selector']]);
    // Moving between steps reads only; the query above the workspace is not touched.
    expect(written()).toEqual([]);
    expect(menuQuery.mock.calls.length).toBe(queries);
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
  const rowSeparators = () => Array.from(document.querySelectorAll<HTMLElement>('[data-dock-row-separator]'));
  const rowHeights = () => rowSeparators().map(separator => Number(separator.getAttribute('aria-valuenow')));
  const lastStored = () => JSON.parse(written().at(-1)![1]) as { preset: string; mode?: string; rows?: number[]; layout: { sizes: number[] } };
  const workspace = () => document.querySelector<HTMLElement>('[data-panel-workspace]')!;
  const stackStored = (rows: number[], extra: Record<string, unknown> = {}) => JSON.stringify({
    v: 1, preset: 'column', hidden: [], mode: 'stack', rows, layout: { type: 'branch', dir: 'column', sizes: [34, 33, 33], children: [group(['trend']), { type: 'branch', dir: 'row', sizes: [50, 50], children: [group(['selector']), group(['detail'])] }, group(['kpi'])] }, ...extra,
  });

  /** Seeds the stored state without counting the seeding as a write. */
  const seed = (value: string) => { storage.setItem(KEY(), value); setItem.mockClear(); };

  it('offers the mode in the `⋯` menu at the end of the toolbar, not as a radio group; fit is checked here as the BASE starts fitted', async () => {
    mountWorkspace(ROWS_PROPS);
    await ready();
    expect(screen.queryByRole('radiogroup', { name: '높이 방식' })).toBeNull();
    expect(screen.getByRole('radio', { name: '세로' })).toBeChecked();
    expect(await modeItem('화면 맞춤')).toBeChecked();
    expect(await modeItem('아래로 쌓기')).not.toBeChecked();
    expect(within(screen.getByRole('menu')).getByText('높이 방식')).toBeInTheDocument();
    expect(workspace()).toHaveAttribute('data-workspace-mode', 'fit');
    expect(document.querySelector('[data-dock-rows]')).toBeNull();
    expect(rowSeparators()).toEqual([]);
  });

  it('the `⋯` is the last control of the toolbar row and returns focus to itself after a choice', async () => {
    mountWorkspace(ROWS_PROPS);
    await ready();
    const more = screen.getByRole('button', { name: '높이 방식' });
    expect(more).toHaveAttribute('title', '높이 방식');
    const toolbar = screen.getByRole('toolbar');
    expect(Array.from(toolbar.querySelectorAll('button')).at(-1)).toBe(more);
    await userEvent.click(await modeItem('아래로 쌓기'));
    await waitFor(() => { expect(more).toHaveFocus(); });
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
    expect(await modeItem('아래로 쌓기')).toBeChecked();
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

  it('caps a new preference at the visible height when a below panel joins or leaves after mount', async () => {
    vi.stubGlobal('innerHeight', 600);
    try {
      const primary = PANELS[0]!;
      const extra = { ...PANELS[1]!, placement: 'below' as const };
      const props = { presets: [{ id: 'single', label: BASE.label, layout: group([primary.id]) }], initialPreset: 'single' };
      seed(stackStored([300], { preset: 'single', layout: group([primary.id]) }));
      const view = mountWorkspace({ ...props, panels: [primary] });
      await ready();
      expect(rowHeights()).toEqual([300]);

      view.rerender(shell(<PanelWorkspace {...BASE} {...props} panels={[{ ...primary, preferredHeight: 800 }, extra]} />));
      await waitFor(() => { expect(rowHeights()).toEqual([600, 360]); });

      rowSeparators()[0]!.focus();
      await userEvent.keyboard('{ArrowUp}');
      expect(rowHeights()).toEqual([576, 360]);
      view.rerender(shell(<PanelWorkspace {...BASE} {...props} panels={[{ ...primary, preferredHeight: 900 }]} />));
      await waitFor(() => { expect(rowHeights()).toEqual([600]); });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps a shared row at its first-screen cap after hiding a member', async () => {
    vi.stubGlobal('innerHeight', 600);
    try {
      const panels = PANELS.map(panel => (['selector', 'detail'].includes(panel.id) ? { ...panel, placement: { row: 'shared' }, preferredHeight: 800 } : panel));
      seed(stackStored([300, 320, 360], { sharedRowSizes: [{ id: 'shared', height: 320 }] }));
      mountWorkspace({ ...ROWS_PROPS, panels });
      await ready();
      await waitFor(() => { expect(rowHeights()).toEqual([300, 600, 360]); });
      await chooseFromMenu('상세 동작', '숨기기');
      expect(rowHeights()).toEqual([300, 600, 360]);
      await sleep(400);
      expect(lastStored()).toMatchObject({ rows: [300, 600, 360], sharedRowSizes: [{ id: 'shared', height: 600 }] });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps a manual shrink after saving and remounting under the same declaration', async () => {
    const panels = PANELS.map(panel => (panel.id === 'kpi' ? { ...panel, preferredHeight: 400 } : panel));
    seed(stackStored([300, 400, 320]));
    const view = mountWorkspace({ ...ROWS_PROPS, panels });
    await ready();
    expect(rowHeights()).toEqual([300, 400, 440]);

    rowSeparators()[2]!.focus();
    await userEvent.keyboard('{ArrowUp}{ArrowUp}');
    await sleep(400);
    expect(lastStored()).toMatchObject({ rows: [300, 400, 392], preferredSeen: { kpi: 400 } });
    view.unmount();
    mountWorkspace({ ...ROWS_PROPS, panels });
    await ready();
    expect(rowHeights()).toEqual([300, 400, 392]);
  });

  it('drops absent panel heights on a scoped write and retains declared hidden panels', async () => {
    const panels = PANELS.map(panel => ({ ...panel, preferredHeight: 400 }));
    storage.setItem(`${KEY()}:scopes`, JSON.stringify([['saved', JSON.parse(stackStored([300, 400, 400], {
      preferredSeen: { 'departed-alias': 500 },
    }))]]));
    mountWorkspace({ ...ROWS_PROPS, panels, persistenceScope: 'saved' });
    await ready();
    await chooseFromMenu('상세 동작', '숨기기');
    await sleep(400);
    const layouts: [string, unknown][] = JSON.parse(storage.getItem(`${KEY()}:scopes`)!);
    const stored = layouts.find(([id]) => id === 'saved')?.[1];
    expect(stored).toMatchObject({ preferredSeen: { trend: 400, selector: 400, detail: 400, kpi: 400 } });
    expect(stored).not.toHaveProperty(['preferredSeen', 'departed-alias']);
  });

  it('opens a row a returning standalone panel recreates at its declared height (#2820)', async () => {
    vi.stubGlobal('innerHeight', 900);
    const panels = [PANELS[0]!, { ...PANELS[2]!, placement: 'below' as const, preferredHeight: 360 }];
    seed(stackStored([480], { layout: group(['trend']) }));
    const view = mountWorkspace({ ...ROWS_PROPS, panels });
    await ready();
    const opened = rowHeights();
    expect(opened).toEqual([480, 400]);
    view.rerender(shell(<PanelWorkspace {...BASE} {...ROWS_PROPS} panels={[PANELS[0]!]} />));
    await sleep(400);
    view.rerender(shell(<PanelWorkspace {...BASE} {...ROWS_PROPS} panels={panels} />));
    expect(await screen.findByRole('tab', { name: '상세' })).toBeInTheDocument();
    expect(rowHeights()).toEqual(opened);
  });

  it.each(['live', 'after remount'] as const)('keeps a shared row shrink when a declared member returns %s', async path => {
    vi.stubGlobal('innerHeight', 600);
    const panels = PANELS.filter(panel => panel.id !== 'kpi').map(panel => (
      panel.primary ? panel : { ...panel, placement: { row: 'shared' }, preferredHeight: 420 }
    ));
    const withoutDetail = panels.filter(panel => panel.id !== 'detail');
    const shared: PanelWorkspaceLayout = { type: 'branch', dir: 'row', sizes: [50, 50], children: [group(['selector']), group(['detail'])] };
    const layout: PanelWorkspaceLayout = { type: 'branch', dir: 'column', sizes: [40, 60], children: [group(['trend']), shared] };
    seed(stackStored([300, 460], { layout, sharedRowSizes: [{ id: 'shared', height: 460 }] }));
    let view = mountWorkspace({ ...ROWS_PROPS, panels });
    await ready();
    expect(screen.getByRole('tab', { name: '상세' })).toBeInTheDocument();
    expect(rowHeights()).toEqual([300, 460]);

    rowSeparators()[1]!.focus();
    await userEvent.keyboard('{ArrowUp}');
    await sleep(400);
    const shrunk = { rows: [300, 436], sharedRowSizes: [{ id: 'shared', height: 436 }] };
    expect(lastStored()).toMatchObject({ ...shrunk, preferredSeen: { selector: 420, detail: 420 } });

    if (path === 'after remount') {
      view.unmount();
      view = mountWorkspace({ ...ROWS_PROPS, panels: withoutDetail });
      await ready();
    } else {
      view.rerender(shell(<PanelWorkspace {...BASE} {...ROWS_PROPS} panels={withoutDetail} />));
    }
    expect(screen.queryByRole('tab', { name: '상세' })).toBeNull();
    expect(rowHeights()).toEqual(shrunk.rows);
    await sleep(400);

    view.rerender(shell(<PanelWorkspace {...BASE} {...ROWS_PROPS} panels={panels} />));
    expect(await screen.findByRole('tab', { name: '상세' })).toBeInTheDocument();
    expect(rowHeights()).toEqual(shrunk.rows);
    await sleep(400);
    expect(lastStored()).toMatchObject({
      ...shrunk,
      preferredSeen: { selector: 420, detail: 420 },
      layout: { children: [{ panels: ['trend'] }, { children: [{ panels: ['selector'] }, { panels: ['detail'] }] }] },
    });
  });

  it.each([NaN, Infinity])('raises a shared row to the valid preference beside %s', async invalid => {
    vi.stubGlobal('innerHeight', 600);
    const panels = PANELS.map(panel => {
      if (panel.id === 'selector') return { ...panel, placement: { row: 'shared' }, preferredHeight: 480 };
      if (panel.id === 'detail') return { ...panel, placement: { row: 'shared' }, preferredHeight: invalid };
      return panel;
    });
    seed(stackStored([300, 320, 360], { sharedRowSizes: [{ id: 'shared', height: 320 }] }));
    mountWorkspace({ ...ROWS_PROPS, panels });
    await ready();
    expect(rowHeights()).toEqual([300, 520, 360]);
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
    // One row with nothing declared fills jsdom's 768px window without reserving the drop strip.
    await waitFor(() => { expect(rowHeights()).toEqual([768]); });
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

  it('moves a panel to a new bottom row using the keyboard while the strip is absent', async () => {
    storage.setItem(KEY(), stackStored([300, 400, 500]));
    mountWorkspace(ROWS_PROPS);
    await ready();
    screen.getAllByRole('button', { name: '선택기 동작' })[0]!.focus();
    await userEvent.keyboard('{Enter}');
    const move = await screen.findByRole('menuitem', { name: '아래 새 줄로 옮기기' });
    move.focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => { expect(rowHeights()).toEqual([300, 400, 500, 360]); });
    expect(screen.queryByText('여기에 놓으면 아래에 새 줄')).not.toBeInTheDocument();
  });

  it('shows a sticky strip during a tab drag and creates a new bottom row on drop', async () => {
    storage.setItem(KEY(), stackStored([300, 400, 500]));
    mountWorkspace(ROWS_PROPS);
    await ready();
    const engine = document.querySelector<HTMLElement>('[data-dock-rows]')!;
    const boxHeight = engine.style.getPropertyValue('--dock-rows-box');
    // jsdom lacks PointerEvent, which Dockview checks when the synthetic dragstart reaches its tab.
    vi.stubGlobal('PointerEvent', window.PointerEvent ?? MouseEvent);
    const tab = screen.getByRole('tab', { name: '선택기' });
    try {
      fireEvent.dragStart(tab);
      const strip = screen.getByText('여기에 놓으면 아래에 새 줄');
      expect(engine.nextElementSibling).toBe(strip);
      expect(engine.style.getPropertyValue('--dock-rows-box')).toBe(boxHeight);
      expect(strip).toHaveClass('sticky', 'bottom-0', 'z-20');
      fireEvent.dragOver(strip);
      expect(strip).toHaveClass('border-accent-primary');
      fireEvent.drop(strip);
      await waitFor(() => { expect(rowHeights()).toEqual([300, 400, 500, 360]); });
      expect(strip).not.toBeInTheDocument();
    } finally {
      fireEvent.dragEnd(tab);
    }
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
    for (const name of ['화면 맞춤', '아래로 쌓기']) expect(await modeItem(name)).toHaveAttribute('aria-disabled', 'true');
    expect(document.getElementById(within(screen.getByRole('menu')).getByRole('group').getAttribute('aria-describedby')!)).toHaveTextContent('좁은 폭에서는 화면 맞춤으로 보입니다');
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
  const saved = (extra: Record<string, unknown> = {}) => JSON.stringify({
    v: 1, preset: 'column', hidden: [], layout: { type: 'branch', dir: 'column', sizes: [34, 33, 33], children: [group(['trend']), { type: 'branch', dir: 'row', sizes: [50, 50], children: [group(['selector']), group(['detail'])] }, group(['kpi'])] }, ...extra,
  });

  it('an untouched workspace starts in 아래로 쌓기 with its rows measured', async () => {
    mountWorkspace({ ...PROPS, initialMode: 'stack' });
    await ready();
    expect(workspace()).toHaveAttribute('data-workspace-mode', 'stack');
    expect(await modeItem('아래로 쌓기')).toBeChecked();
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
    expect(await modeItem('화면 맞춤')).toBeChecked();
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

  it.each(['stacked', 'maximized'])('restores a hidden panel to its declared row on an explicit reveal from a %s workspace', async mode => {
    const extra: Partial<PanelWorkspaceProps> = {
      panels: [PANELS[0]!, { ...PANELS[1]!, placement: 'below' }],
      presets: [{ id: 'focus', label: { ko: '집중', en: 'Focus' }, layout: group(['trend']) }],
      initialMode: 'stack', compactBelow: 0,
    };
    const view = render(withRequest(null, extra));
    await ready();
    await chooseFromMenu('선택기 동작', '숨기기');
    await waitFor(() => expect(tab('selector')).toBeNull());
    if (mode === 'maximized') await userEvent.click(screen.getByRole('button', { name: '추세 최대화' }));
    view.rerender(withRequest({ panelId: 'selector', seq: 1, restoreHidden: true }, extra));
    await waitFor(() => expect(tab('selector')).toHaveAttribute('aria-selected', 'true'));
    expect(document.querySelector('[data-dock-panel="selector"]')).toHaveAttribute('data-dock-visible', 'true');
    expect(document.querySelector('[data-dock-row-separator="1"]')).toBeInTheDocument();
    expect(tab('trend').compareDocumentPosition(tab('selector')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each(['same', 'other'] as const)('activates a newly added panel in the %s group during maximize', async target => {
    const panels = [PANELS[0]!, PANELS[1]!];
    const detail = { ...PANELS[2]!, placement: target === 'other' ? 'below' as const : undefined };
    const extra = { panels, initialMode: 'stack' as const, compactBelow: 0 };
    const view = render(withRequest(null, extra));
    await ready();
    await userEvent.click(screen.getByRole('button', { name: '추세 최대화' }));
    expect(screen.getByRole('button', { name: '원래 크기로' })).toBeInTheDocument();
    view.rerender(withRequest({ panelId: 'detail', seq: 1 }, { ...extra, panels: [...panels, detail] }));
    await waitFor(() => expect(tab('detail')).toHaveAttribute('aria-selected', 'true'));
    expect(document.querySelector('[data-dock-panel="detail"]')).toHaveAttribute('data-dock-visible', 'true');
    expect(screen.queryAllByRole('button', { name: '원래 크기로' })).toHaveLength(target === 'same' ? 1 : 0);
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


describe('visual density is independent of panel admission (#1141)', () => {
  it.each(['comfortable', 'compact'] as const)('%s changes gap while narrow admission keeps its own attribute', async density => {
    render(shell(<PageDensityProvider value={density}><PanelWorkspace {...BASE} compactPreset="stack" /></PageDensityProvider>));
    await ready();
    const workspace = document.querySelector('[data-panel-workspace]')!;
    expect(workspace).toHaveClass(density === 'compact' ? 'gap-1.5' : 'gap-2');
    expect(workspace).not.toHaveAttribute('data-workspace-compact');
    observer.resize(600);
    await waitFor(() => expect(workspace).toHaveAttribute('data-workspace-compact'));
    expect(workspace.getAttribute('data-workspace-density')).toBe(density === 'compact' ? 'compact' : null);
    expect(workspace).toHaveClass(density === 'compact' ? 'gap-1.5' : 'gap-2');
  });
});

describe('PanelWorkspace: 쌓기 기본값과 stackPreset (#701, ADR-0130)', () => {
  const COLUMN: PanelWorkspaceProps['presets'][number] = {
    id: 'column', label: { ko: '세로', en: 'Column' },
    layout: { type: 'branch', dir: 'column', sizes: [1, 1, 1], children: [group(['trend']), { type: 'branch', dir: 'row', sizes: [1, 1], children: [group(['selector']), group(['detail'])] }, group(['kpi'])] },
  };
  const WITH_STACK: Partial<PanelWorkspaceProps> = { presets: [...PRESETS, COLUMN], initialPreset: 'balanced', stackPreset: 'column', initialMode: undefined };
  const workspace = () => document.querySelector<HTMLElement>('[data-panel-workspace]')!;
  const lastStored = () => JSON.parse(written().at(-1)![1]) as { preset: string; mode?: string; rows?: number[] };

  it('without initialMode an untouched workspace starts in stack, on stackPreset', async () => {
    mountWorkspace(WITH_STACK);
    await ready();
    expect(workspace()).toHaveAttribute('data-workspace-mode', 'stack');
    expect(screen.getByRole('radio', { name: '세로' })).toBeChecked();
    expect(document.querySelectorAll('[data-dock-row-separator]')).toHaveLength(3);
  });

  it('initialMode fit still starts fitted on initialPreset', async () => {
    mountWorkspace({ ...WITH_STACK, initialMode: 'fit' });
    await ready();
    expect(workspace()).toHaveAttribute('data-workspace-mode', 'fit');
    expect(screen.getByRole('radio', { name: '균형' })).toBeChecked();
  });

  it('a stored fit (and a value written before modes) stays fit on its stored preset: the load rewrites nothing', async () => {
    storage.setItem(KEY(), JSON.stringify({ v: 1, preset: 'balanced', hidden: [], layout: { type: 'branch', dir: 'row', sizes: [20, 60, 20], children: [group(['selector']), { type: 'branch', dir: 'column', sizes: [25, 75], children: [group(['kpi']), group(['trend'])] }, group(['detail'])] } }));
    setItem.mockClear();
    mountWorkspace(WITH_STACK);
    await ready();
    expect(workspace()).toHaveAttribute('data-workspace-mode', 'fit');
    expect(screen.getByRole('radio', { name: '균형' })).toBeChecked();
    await sleep(400);
    expect(written()).toEqual([]);
  });

  it('the mode switch moves between the two presets while the arrangement is untouched, and keeps a layout the user chose', async () => {
    mountWorkspace(WITH_STACK);
    await ready();
    await choose('화면 맞춤');
    await waitFor(() => { expect(screen.getByRole('radio', { name: '균형' })).toBeChecked(); });
    await choose('아래로 쌓기');
    await waitFor(() => { expect(screen.getByRole('radio', { name: '세로' })).toBeChecked(); });
    // The user's own arrangement (a preset that is neither of the two) survives both switches.
    await choose('집중');
    await choose('화면 맞춤');
    expect(screen.getByRole('radio', { name: '집중' })).toBeChecked();
    await choose('아래로 쌓기');
    expect(screen.getByRole('radio', { name: '집중' })).toBeChecked();
    await sleep(400);
    expect(lastStored()).toMatchObject({ preset: 'focus', mode: 'stack' });
  });

  it('a first view narrower than compactBelow shows fit at once and measures and stores no rows', async () => {
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const width = this.hasAttribute('data-panel-workspace') ? 600 : 0;
      return { x: 0, y: 0, top: 0, left: 0, right: width, bottom: 0, width, height: 0, toJSON: () => ({}) };
    });
    observer.resize(600);
    try {
      mountWorkspace(WITH_STACK);
      await ready();
      expect(workspace()).toHaveAttribute('data-workspace-mode', 'fit');
      await sleep(400);
      expect(written().every(([, value]) => (JSON.parse(value) as { rows?: number[] }).rows === undefined)).toBe(true);
    } finally { rect.mockRestore(); }
  });
});

describe('row geometry and focus at the command boundary (#701 fix round)', () => {
  const COLUMN: PanelWorkspaceProps['presets'][number] = { id: 'column', label: { ko: '세로', en: 'Column' }, layout: { type: 'branch', dir: 'column', sizes: [1, 1, 1, 1], children: PANELS.map(panel => group([panel.id])) } };
  const stackProps: Partial<PanelWorkspaceProps> = { presets: [COLUMN, ...PRESETS], initialPreset: 'column', initialMode: 'stack' };
  /** getComputedStyle calls on the workspace root made by the workspace itself (the row measurement `oneRowHeight`; testing-library's own queries read it too, so the call site is filtered). */
  const rootStyleReads = async (strict: boolean) => {
    const real = window.getComputedStyle.bind(window);
    const reads = vi.fn();
    storage.removeItem(KEY());
    const stackLimit = Error.stackTraceLimit;
    Error.stackTraceLimit = 60;
    vi.spyOn(window, 'getComputedStyle').mockImplementation(((element: Element, pseudo?: string | null) => { if (element.hasAttribute('data-panel-workspace')) { reads(new Error().stack); } return real(element, pseudo); }) as typeof window.getComputedStyle);
    try {
      const view = render(strict ? <StrictMode>{shell(<PanelWorkspace {...BASE} {...stackProps} />)}</StrictMode> : shell(<PanelWorkspace {...BASE} {...stackProps} />));
      await ready();
      await settle();
      reads.mockClear();
      fireEvent.click(await screen.findByRole('radio', { name: '집중' }));
      await settle();
      const count = reads.mock.calls.filter(([stack]) => String(stack).includes('PanelWorkspace.tsx')).length;
      view.unmount();
      return count;
    } finally { vi.restoreAllMocks(); Error.stackTraceLimit = stackLimit; }
  };

  it('a replayed state updater does not measure the DOM again: StrictMode (updaters run twice) reads as often as a plain render', async () => {
    const plain = await rootStyleReads(false);
    cleanup();
    const strict = await rootStyleReads(true);
    expect(plain).toBeGreaterThan(0);
    expect(strict).toBe(plain);
  });

  it('restoring from the panel menu puts focus on that panel\'s tab, not on body', async () => {
    mountWorkspace({ ...stackProps, initialMode: 'fit' });
    await ready();
    await userEvent.click(screen.getAllByRole('button', { name: '추세 최대화' })[0]!);
    await waitFor(() => { expect(screen.getByRole('button', { name: '원래 크기로' })).toBeInTheDocument(); });
    await chooseFromMenu('추세 동작', '원래 크기로');
    await waitFor(() => { expect(document.activeElement).toBe(document.querySelector('[role="tab"][data-tab-panel-id="trend"]')); });
  });

  it('the maximize toggle button path keeps its own focus', async () => {
    mountWorkspace({ ...stackProps, initialMode: 'fit' });
    await ready();
    await userEvent.click(screen.getAllByRole('button', { name: '추세 최대화' })[0]!);
    const restore = await screen.findByRole('button', { name: '원래 크기로' });
    await userEvent.click(restore);
    await settle();
    expect(document.activeElement).not.toBe(document.body);
  });
});

it('reconciles added and removed panels without changing persistKey (#2028 SHE-24)', async () => {
  const { rerender } = mountWorkspace();
  await ready();
  const extra = { id: 'extra', title: { ko: '추가', en: 'Extra' }, render: () => <Probe id="extra" /> };
  rerender(shell(<PanelWorkspace {...BASE} panels={[...PANELS, extra]} />));
  await screen.findByRole('tab', { name: '추가' });
  rerender(shell(<PanelWorkspace {...BASE} panels={PANELS} />));
  await waitFor(() => expect(screen.queryByRole('tab', { name: '추가' })).toBeNull());
  expect(screen.getByRole('tab', { name: '추세' })).toBeInTheDocument();
});

describe('PanelWorkspace: placement below and pin (#2398)', () => {
  const extra = (placement?: 'below') => ({ id: 'extra', title: { ko: '추가', en: 'Extra' }, render: () => <Probe id="extra" />, placement });

  it('a panel with placement below that joins the panels opens as a new last row, not a tab with the primary', async () => {
    const { rerender } = mountWorkspace({ presets: [PRESETS[1]!], initialPreset: 'focus' });
    await ready();
    rerender(shell(<PanelWorkspace {...BASE} presets={[PRESETS[1]!]} initialPreset="focus" panels={[...PANELS, extra('below')]} />));
    await screen.findByRole('tab', { name: '추가' });
    await waitFor(() => { expect(groups()).toContainEqual(['extra']); });
    expect(groups().find(panels => panels.includes('trend'))).toEqual(['trend']);
  });

  it('without placement the joining panel is a tab in the primary group (unchanged default)', async () => {
    const { rerender } = mountWorkspace({ presets: [PRESETS[1]!], initialPreset: 'focus' });
    await ready();
    rerender(shell(<PanelWorkspace {...BASE} presets={[PRESETS[1]!]} initialPreset="focus" panels={[...PANELS, extra()]} />));
    await screen.findByRole('tab', { name: '추가' });
    expect(groups().find(panels => panels.includes('trend'))).toEqual(['extra', 'trend']);
  });

  it('draws a pressed-state pin button only for a panel that opts in, and calls onToggle', async () => {
    const onToggle = vi.fn();
    mountWorkspace({ panels: PANELS.map(panel => panel.id === 'selector' ? { ...panel, pin: { pinned: true, onToggle } } : panel) });
    await ready();
    expect(screen.queryByRole('button', { name: '추세 고정' })).toBeNull();
    const pin = screen.getByRole('button', { name: '선택기 고정' });
    expect(pin).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(pin);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

describe('PanelWorkspace: automatic fill row (#2518)', () => {
  const primary = PANELS[0]!;
  const extra = { ...PANELS[1]!, placement: 'below' as const, preferredHeight: 420 };
  const preset = { ...PRESETS[0]!, layout: group([primary.id]) };
  const separator = (index: number) => document.querySelector<HTMLElement>(`[data-dock-row-separator="${index}"]`)!;
  const heights = () => Array.from(document.querySelectorAll('[data-dock-row-separator]'), row => Number(row.getAttribute('aria-valuenow')));

  function mountFill(initialTop: number, initialPanels: PanelWorkspaceProps['panels'] = [primary]) {
    let top = initialTop;
    const real = HTMLElement.prototype.getBoundingClientRect;
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.hasAttribute('data-panel-workspace') ? new DOMRect(0, top, 1200, 600) : real.call(this);
    });
    const realHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight')!.get!;
    const clientHeight = vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.hasAttribute('data-workspace-scrollport') ? 900 : realHeight.call(this);
    });
    const contents = (panels: PanelWorkspaceProps['panels']) => shell(
      <div data-workspace-scrollport style={{ overflowY: 'auto' }}>
        <div data-before-workspace />
        <PanelWorkspace {...BASE} initialMode="stack" presets={[preset]} panels={panels} />
      </div>,
    );
    const view = render(contents(initialPanels));
    return {
      moveTo: (nextTop: number) => { top = nextTop; observer.touch(target => target.hasAttribute('data-before-workspace'), 1200); },
      panels: (panels: PanelWorkspaceProps['panels']) => view.rerender(contents(panels)),
      restore: () => { rect.mockRestore(); clientHeight.mockRestore(); },
    };
  }

  it('fills the visible area after a preceding sibling moves the workspace up', async () => {
    const view = mountFill(380);
    try {
      await ready();
      expect(heights()[0]).toBeGreaterThan(0);
      view.moveTo(160);
      await waitFor(() => { expect(heights()).toEqual([740]); });
      await advance(400);
      expect(JSON.parse(storage.getItem(KEY())!)).not.toHaveProperty('rows');
    } finally { view.restore(); }
  });

  it('omits automatically measured px from the saved stack state after 기본 배치', async () => {
    storage.setItem(KEY(), JSON.stringify({ v: 1, preset: preset.id, layout: preset.layout, hidden: [], mode: 'stack', rows: [320] }));
    const view = mountFill(160);
    try {
      await ready();
      fireEvent.click(screen.getByRole('button', { name: '기본 배치' }));
      await advance(400);
      const saved = JSON.parse(storage.getItem(KEY())!);
      expect(saved).toMatchObject({ mode: 'stack' });
      expect(saved).not.toHaveProperty('rows');
    } finally { view.restore(); }
  });

  it('keeps a resized row when the offset changes and a below panel opens and closes', async () => {
    const view = mountFill(300);
    try {
      await ready();
      fireEvent.keyDown(separator(0), { key: 'Home' });
      const resized = Number(separator(0).getAttribute('aria-valuemin'));
      expect(heights()).toEqual([resized]);
      view.moveTo(160);
      view.panels([primary, extra]);
      await screen.findByRole('tab', { name: '선택기' });
      expect(heights()[0]).toBe(resized);
      view.panels([primary]);
      await waitFor(() => { expect(heights()).toEqual([resized]); });
    } finally { view.restore(); }
  });

  it('keeps the automatic pair after a reload with the below panel open, then refills when it closes', async () => {
    const layout = { type: 'branch', dir: 'column', sizes: [50, 50], children: [group([primary.id]), group([extra.id])] };
    storage.setItem(KEY(), JSON.stringify({ v: 1, preset: preset.id, layout, hidden: [], mode: 'stack' }));
    const view = mountFill(160, [primary, extra]);
    try {
      await ready();
      expect(heights()).toEqual([367, 367]);
      await advance(400);
      expect(JSON.parse(storage.getItem(KEY())!)).not.toHaveProperty('rows');
      view.panels([primary]);
      await waitFor(() => { expect(heights()).toEqual([740]); });
    } finally { view.restore(); }
  });

  it('shares the visible area evenly with a below panel and refills when it closes', async () => {
    const view = mountFill(160);
    try {
      await ready();
      view.panels([primary, extra]);
      await screen.findByRole('tab', { name: '선택기' });
      expect(heights()).toEqual([367, 367]);
      view.moveTo(280);
      await waitFor(() => { expect(heights()).toEqual([307, 307]); });
      // Half of what is left would fall under the 200px row minimum: each row keeps its own height and the page grows.
      view.moveTo(500);
      await waitFor(() => { expect(heights()).toEqual([400, 460]); });
      view.moveTo(160);
      await waitFor(() => { expect(heights()).toEqual([367, 367]); });
      view.panels([primary]);
      await waitFor(() => { expect(heights()).toEqual([740]); });
      view.panels([primary, extra]);
      await screen.findByRole('tab', { name: '선택기' });
      expect(heights()).toEqual([367, 367]);
      await chooseFromMenu('선택기 동작', '숨기기');
      await waitFor(() => { expect(heights()).toEqual([740]); });
    } finally { view.restore(); }
  });
});

describe('PanelWorkspace: standalone, no PlatformProvider (#1953)', () => {
  const standalone = (props: Partial<PanelWorkspaceProps> = {}) => render(<I18nProvider><PanelWorkspace {...BASE} {...props} /></I18nProvider>);
  const appStorage = () => {
    const memory = memoryStorage();
    const writes: [string, string][] = [];
    return { writes, memory, storage: { getItem: (key: string) => memory.getItem(key), setItem: (key: string, value: string) => { writes.push([key, value]); memory.setItem(key, value); } } };
  };

  it('renders under I18nProvider alone and keeps the layout in memory without persistence', async () => {
    standalone();
    await screen.findAllByRole('tab');
    await choose('집중');
    await waitFor(() => { expect(groups()).toEqual([['trend'], ['detail', 'kpi', 'selector']]); });
    await sleep(400);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('writes under the injected key through the injected storage, and restores it on the next mount', async () => {
    const app = appStorage();
    const view = standalone({ persistence: { key: 'app:alice:board', storage: app.storage } });
    await screen.findAllByRole('tab');
    await choose('집중');
    await waitFor(() => { expect(app.writes).toHaveLength(1); }, { timeout: 1000 });
    expect(app.writes[0]![0]).toBe('app:alice:board');
    expect(JSON.parse(app.writes[0]![1])).toMatchObject({ v: 1, preset: 'focus' });
    expect(setItem).not.toHaveBeenCalled();
    view.unmount();
    standalone({ persistence: { key: 'app:alice:board', storage: app.storage } });
    await screen.findAllByRole('tab');
    expect(screen.getByRole('radio', { name: '집중' })).toBeChecked();
  });

  it('flushes a change on unmount within the delay through the injected storage', async () => {
    const app = appStorage();
    const view = standalone({ persistence: { key: 'app:board', storage: app.storage } });
    await screen.findAllByRole('tab');
    await choose('집중');
    expect(app.writes).toEqual([]);
    view.unmount();
    expect(app.writes.map(([key]) => key)).toEqual(['app:board']);
    expect(JSON.parse(app.writes[0]![1])).toMatchObject({ preset: 'focus' });
    expect(setItem).not.toHaveBeenCalled();
  });

  it('defaults the injected key to localStorage and survives a storage that throws', async () => {
    standalone({ persistence: { key: 'app:board' } });
    await screen.findAllByRole('tab');
    await choose('쌓기');
    await waitFor(() => { expect(setItem.mock.calls.map(([key]) => key)).toEqual(['app:board']); }, { timeout: 1000 });
    cleanup();
    const failing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    const view = standalone({ persistence: { key: 'app:board', storage: failing } });
    await screen.findAllByRole('tab');
    await choose('집중');
    await waitFor(() => { expect(groups()).toEqual([['trend'], ['detail', 'kpi', 'selector']]); });
    await sleep(400);
    expect(() => { view.unmount(); }).not.toThrow();
  });

  it('ignores persistence inside a PlatformProvider: the platform key and localStorage stay', async () => {
    const app = appStorage();
    mountWorkspace({ persistence: { key: 'app:shared', storage: app.storage } });
    await ready();
    await choose('집중');
    await waitFor(() => { expect(written()).toHaveLength(1); }, { timeout: 1000 });
    expect(written()[0]![0]).toBe(KEY());
    expect(app.writes).toEqual([]);
  });
});

describe('PanelWorkspace: minimize (#2359)', () => {
  const minimizable = (summary?: string): PanelWorkspaceProps['panels'] => PANELS.map(panel => panel.id === 'selector' ? { ...panel, minimize: summary === undefined ? {} : { summary: { ko: summary, en: summary } } } : panel);

  it('without the option a panel header has no minimize button and the toolbar no chip', async () => {
    mountWorkspace();
    await ready();
    expect(screen.queryByRole('button', { name: /최소화/ })).toBeNull();
    expect(document.querySelector('[data-workspace-minimized]')).toBeNull();
  });

  it('legacy minimize summary appears in the top tab; no minimize button; peek and pin restore it', async () => {
    mountWorkspace({ panels: minimizable('PM 6/6 · Motion 4/4') });
    await ready();
    expect(screen.queryByRole('button', { name: '추세 최소화' })).toBeNull();
    expect(screen.queryByRole('button', { name: '선택기 최소화' })).toBeNull();
    await chooseFromMenu('선택기 동작', '위로 접기');
    await settle();
    await waitFor(() => { expect(document.querySelector('[data-dock-panel="selector"]')).toBeNull(); });
    const chip = screen.getByRole('button', { name: '선택기 · PM 6/6 · Motion 4/4' });
    expect(chip).toHaveTextContent('선택기 · PM 6/6 · Motion 4/4');
    await waitFor(() => { expect(chip).toHaveFocus(); });
    expect(screen.getByRole('button', { name: '숨긴 패널 0' })).toBeDisabled();
    await userEvent.click(chip);
    await settle();
    await waitFor(() => { expect(document.querySelector('[data-dock-panel="selector"]')).not.toBeNull(); });
    await userEvent.click(screen.getByRole('button', { name: '고정해서 펼치기' }));
    expect(document.querySelector('[data-workspace-minimized]')).toBeNull();
    await waitFor(() => { expect(screen.getByRole('tab', { name: /선택기/ })).toHaveFocus(); });
  });

  it('a legacy minimize declaration without summary shows its title only when collapsed from the ⋯ menu', async () => {
    mountWorkspace({ panels: minimizable() });
    await ready();
    await chooseFromMenu('선택기 동작', '위로 접기');
    expect(await screen.findByRole('button', { name: '선택기' })).toHaveTextContent(/^선택기$/);
  });
});

describe('PanelWorkspace: toolbarActions (#2416)', () => {
  it('draws the menu\'s actions at the end of the workspace toolbar', async () => {
    mountWorkspace({ toolbarActions: <button type="button">패널 추가</button> });
    await ready();
    const toolbar = screen.getByRole('toolbar');
    expect(within(toolbar).getByRole('button', { name: '패널 추가' }).closest('[data-workspace-actions]')).not.toBeNull();
  });

  it('inside a command host, where no toolbar is drawn, the actions get their own row', async () => {
    render(shell(<WorkspaceCommandsHost><PanelWorkspace {...BASE} toolbarActions={<button type="button">패널 추가</button>} /></WorkspaceCommandsHost>));
    await ready();
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(screen.getByRole('button', { name: '패널 추가' }).closest('[data-workspace-actions]')).not.toBeNull();
  });

  it('without the prop nothing is added', async () => {
    const { container } = mountWorkspace();
    await ready();
    expect(container.querySelector('[data-workspace-actions]')).toBeNull();
  });
});

describe('PanelWorkspace: edges, peek and float (#2435)', () => {
  const edge = (id: string) => document.querySelector<HTMLElement>(`[data-workspace-edge-panel="${id}"]`)!;
  const floating = (id: string) => document.querySelector(`[data-dock-floating="${id}"]`);
  it.each([
    { width: 800, compactBelow: undefined, expectedGroups: 1 },
    { width: 600, compactBelow: 0, expectedGroups: 4 },
    { width: 1000, compactBelow: 1100, expectedGroups: 1 },
  ])('compactBelow=$compactBelow preserves its projection at $width independently of edges', async ({ width, compactBelow, expectedGroups }) => {
    mountWorkspace({ compactBelow }); await ready();
    observer.resize(width); await settle();
    await waitFor(() => expect(groups()).toHaveLength(expectedGroups));
    expect(document.querySelector('[data-dock-narrow]')).toHaveAttribute('data-dock-narrow', String(expectedGroups === 1));
    expect(written()).toEqual([]);
  });
  it.each(['pin', 'close'] as const)('direct floating %s cannot steal focus from the next group menu', async action => {
    mountWorkspace(); await ready();
    await chooseFromMenu('선택기 동작', '띄우기');
    await userEvent.click(screen.getByRole('button', { name: action === 'pin' ? '고정해서 펼치기' : '접기' }));
    await waitFor(() => expect(floating('selector')).toBeNull());
    await settle();
    const trigger = screen.getByRole('button', { name: '추세 동작' });
    await userEvent.click(trigger);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
    await settle();
    expect(trigger).toHaveFocus();
  });
  it('only plain hidden panels appear in the hidden list; narrow width includes edge panels again', async () => {
    mountWorkspace(); await ready();
    await chooseFromMenu('선택기 동작', '왼쪽으로 접기');
    await chooseFromMenu('상세 동작', '위로 접기');
    expect(screen.getByRole('button', { name: '숨긴 패널 0' })).toBeDisabled();
    await chooseFromMenu('지표 동작', '숨기기');
    expect(edge('kpi')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: '숨긴 패널 1' }));
    expect(screen.getByRole('menuitem', { name: '지표 다시 보기' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /선택기 다시 보기|상세 다시 보기/ })).toBeNull();
    await userEvent.keyboard('{Escape}');
    observer.resize(691); await settle();
    expect(screen.getByRole('button', { name: '숨긴 패널 3' })).toBeEnabled();
  });
  it('plain hide removes a stacked row without adding an edge strip or another workspace gap', async () => {
    mountWorkspace({ initialMode: 'stack', presets: [{ id: 'rows', label: { ko: '줄', en: 'Rows' }, layout: { type: 'branch', dir: 'column', sizes: [1, 1, 1], children: [group(['trend', 'selector']), group(['kpi']), group(['detail'])] } }], initialPreset: 'rows' });
    await ready();
    await waitFor(() => expect(document.querySelectorAll('[data-dock-row-separator]')).toHaveLength(3));
    const before = Array.from(document.querySelectorAll('[data-dock-row-separator]')).map(el => Number(el.getAttribute('aria-valuenow')));
    await chooseFromMenu('상세 동작', '숨기기');
    expect(Array.from(document.querySelectorAll('[data-dock-row-separator]')).map(el => Number(el.getAttribute('aria-valuenow')))).toEqual(before.slice(0, 2));
    expect(document.querySelector('[data-workspace-edge]')).toBeNull();
    expect(document.querySelector('[data-dock-rows]')).toHaveStyle({ '--dock-rows-box': `${before[0]! + before[1]! + 6}px` });
  });
  it('top edge keeps its focus indicator inside the scroll clip', async () => {
    mountWorkspace(); await ready();
    await chooseFromMenu('선택기 동작', '위로 접기');
    // Button owns a 2px ring with a 2px offset: leave 4px inside the scrolling toolbar on every side.
    expect(edge('selector').closest('[data-workspace-edge="top"]')).toHaveClass('p-1');
  });
  it.each(['왼쪽으로 접기', '위로 접기'])('%s unmounts; peek, pin and float keep queries and parent zoom/legend state', async action => {
    function Stateful() {
      // Query ownership survives collapse just like zoom/legend ownership; a panel receives the Kernel answer.
      const query = useMenuQuery(endpoint, { page: 2 });
      const [zoom, setZoom] = useState(1);
      const [legend, setLegend] = useState(true);
      return <><button onClick={() => { setZoom(2); setLegend(false); }}>zoom</button><span data-testid="view-state">{zoom}:{String(legend)}</span><PanelWorkspace {...BASE} panels={PANELS.map(p => p.id === 'selector' ? { ...p, render: () => <span data-testid="cached-panel">{query.status}</span> } : p)} /></>;
    }
    render(shell(<Stateful />));
    await ready();
    await waitFor(() => expect(screen.getByTestId('cached-panel')).toHaveTextContent('done'));
    await userEvent.click(screen.getByRole('button', { name: 'zoom' }));
    const calls = menuQuery.mock.calls.length;
    await chooseFromMenu('선택기 동작', action);
    expect(document.querySelector('[data-dock-panel="selector"]')).toBeNull();
    expect(edge('selector')).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(edge('selector'));
    await waitFor(() => expect(floating('selector')).not.toBeNull());
    await waitFor(() => expect(screen.getByTestId('cached-panel')).toHaveTextContent('done'));
    await userEvent.click(screen.getByRole('button', { name: '고정해서 펼치기' }));
    await waitFor(() => expect(floating('selector')).toBeNull());
    await chooseFromMenu('선택기 동작', '띄우기');
    await waitFor(() => expect(floating('selector')).not.toBeNull());
    expect(menuQuery).toHaveBeenCalledTimes(calls);
    expect(screen.getByTestId('view-state')).toHaveTextContent('2:false');
  });
  it('icon-only rail uses a focus/hover tooltip, and supports monograms and roving arrows', async () => {
    mountWorkspace({ panels: PANELS.map(p => p.id === 'selector' ? { ...p, icon: House, collapse: { summary: { ko: '조건', en: 'Conditions' } } } : p) });
    await ready();
    await chooseFromMenu('선택기 동작', '왼쪽으로 접기');
    await chooseFromMenu('상세 동작', '왼쪽으로 접기');
    expect(edge('selector')).toHaveAccessibleName('선택기 · 조건');
    expect(edge('selector').textContent).toBe('');
    expect(edge('detail')).toHaveTextContent('상');
    await userEvent.hover(edge('selector'));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('선택기');
    await userEvent.unhover(edge('selector'));
    act(() => edge('selector').focus());
    expect(await screen.findByRole('tooltip')).toHaveTextContent('선택기');
    fireEvent.keyDown(edge('selector'), { key: 'ArrowDown' });
    expect(edge('detail')).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(floating('detail')).not.toBeNull());
  });
  it('peek closes on re-click, outside and Esc; menu consumes Esc before peek and maximize', async () => {
    mountWorkspace(); await ready();
    await chooseFromMenu('선택기 동작', '위로 접기');
    await userEvent.click(edge('selector'));
    await waitFor(() => expect(floating('selector')).not.toBeNull());
    await userEvent.click(edge('selector'));
    await waitFor(() => expect(floating('selector')).toBeNull());
    await userEvent.click(edge('selector'));
    await userEvent.click(document.body);
    await waitFor(() => expect(floating('selector')).toBeNull());
    await userEvent.click(screen.getByRole('button', { name: '추세 최대화' }));
    await userEvent.click(edge('selector'));
    await waitFor(() => expect(floating('selector')).not.toBeNull());
    await userEvent.click(screen.getByRole('button', { name: '선택기 동작' }));
    await userEvent.keyboard('{Escape}');
    expect(floating('selector')).not.toBeNull();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(floating('selector')).toBeNull());
    expect(edge('selector')).toHaveFocus();
    expect(screen.getByRole('button', { name: '원래 크기로' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('button', { name: '원래 크기로' })).toBeNull());
  });
  it('float survives outside/Esc, offers keyboard placement/size, persists, reloads and X collapses to its edge', async () => {
    const view = mountWorkspace(); await ready();
    await chooseFromMenu('선택기 동작', '왼쪽으로 접기');
    await userEvent.click(edge('selector'));
    await chooseFromMenu('선택기 동작', '띄우기');
    await userEvent.click(document.body); await userEvent.keyboard('{Escape}');
    expect(floating('selector')).not.toBeNull();
    for (const item of ['왼쪽 위', '가운데', '작게', '크게']) await chooseFromMenu('선택기 동작', item);
    await sleep(400);
    expect(JSON.parse(written().at(-1)![1])).toMatchObject({ v: 1, floating: [expect.objectContaining({ panelId: 'selector', width: expect.any(Number) })] });
    view.unmount(); mountWorkspace(); await ready();
    await waitFor(() => expect(floating('selector')).not.toBeNull());
    await userEvent.click(screen.getByRole('button', { name: '접기' }));
    expect(edge('selector').closest('[aria-orientation="vertical"]')).not.toBeNull();
  });
  it('primary and opt-outs have no forbidden actions; edges limits the menu', async () => {
    mountWorkspace({ edges: ['top'], panels: PANELS.map(p => p.id === 'selector' ? { ...p, collapse: false, float: false } : p) }); await ready();
    for (const name of ['추세 동작', '선택기 동작']) {
      await userEvent.click(screen.getByRole('button', { name }));
      expect(screen.queryByRole('menuitem', { name: /접기|띄우기/ })).toBeNull();
      await userEvent.keyboard('{Escape}');
    }
    await userEvent.click(screen.getByRole('button', { name: '상세 동작' }));
    expect(screen.queryByRole('menuitem', { name: '왼쪽으로 접기' })).toBeNull();
    expect(screen.getByRole('menuitem', { name: '위로 접기' })).toBeInTheDocument();
  });
  it('below 692 strips and float turn off; hidden list restores panels and widening keeps float preference', async () => {
    mountWorkspace(); await ready();
    await chooseFromMenu('선택기 동작', '위로 접기');
    await chooseFromMenu('상세 동작', '띄우기');
    observer.resize(691); await settle();
    expect(document.querySelector('[data-workspace-edge-panel]')).toBeNull();
    expect(floating('detail')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: '지표 동작' }));
    expect(screen.queryByRole('menuitem', { name: '띄우기' })).toBeNull();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: '숨긴 패널 2' }));
    await userEvent.click(screen.getByRole('menuitem', { name: '선택기 다시 보기' }));
    observer.resize(1200); await settle();
    await waitFor(() => expect(floating('detail')).not.toBeNull());
  });
  it('uses the workspace width once: a left rail cannot independently narrow the inner dock (#2435)', async () => {
    mountWorkspace(); await ready();
    observer.resize(710); await settle();
    await chooseFromMenu('선택기 동작', '왼쪽으로 접기');
    observer.touch(target => target.hasAttribute('data-dock-layout'), 674); await settle();
    await userEvent.click(edge('selector'));
    await waitFor(() => expect(floating('selector')).not.toBeNull());
  });
});

it.each(['settings', 'runs'])('joins the shared trend row after %s without remounting its surviving body', async first => {
  const primary = PANELS[0]!;
  const trends = ['settings', 'runs'].map(id => ({
    id, title: { ko: id, en: id }, placement: { row: 'trends' }, render: () => <Probe id={id} />,
  }));
  const props = { presets: [{ id: 'single', label: BASE.label, layout: group([primary.id]) }], initialPreset: 'single' };
  const view = (ids: string[]) => shell(<PanelWorkspace {...BASE} {...props} panels={[primary, ...trends.filter(panel => ids.includes(panel.id))]} />);
  const { rerender } = render(view([first]));
  await ready();
  const survivor = await screen.findByTestId(`probe-${first}`);
  const [top, bottom] = ['trend', 'settings'];
  rerender(view(['settings', 'runs']));
  await screen.findByTestId('probe-runs');
  const original = dockProps.current!.layout as { children: { type: string }[] };
  expect(original.children.map(row => row.type)).toEqual(['group', 'branch']);
  const resized = { ...original, sizes: [62, 38], children: [original.children[0], { ...original.children[1], sizes: [31, 69] }] };
  act(() => dockProps.current!.onLayoutChange(resized));
  rerender(view([first]));
  await waitFor(() => expect(dockProps.current!.layout).toMatchObject({ children: [{ panels: [top] }, { panels: [first] }] }));
  rerender(view(['settings', 'runs']));
  await waitFor(() => expect(dockProps.current!.layout).toMatchObject({
    sizes: [62, 38],
    children: [{ panels: [top] }, { sizes: [31, 69], children: [{ panels: [bottom] }, { panels: ['runs'] }] }],
  }));
  expect(screen.getByTestId(`probe-${first}`)).toBe(survivor);
});

async function openMergedChartActions(keep?: PanelWorkspaceProps['panels'][number]['keep']) {
  const user = userEvent.setup();
  function WorkspaceWithChart() {
    const [panels, setPanels] = useState(PANELS);
    return <PanelWorkspace {...BASE} panels={panels.map(panel => panel.id === 'selector' ? {
      ...panel, keep, onRemove: () => setPanels(current => current.filter(item => item.id !== panel.id)),
      render: () => <AnalysisChartFrame chartId="secondary" title="Secondary chart" unit="s" series={[]} xType="category" />,
    } : panel)} />;
  }
  render(shell(<WorkspaceWithChart />));
  await ready();
  const tab = screen.getByRole('tab', { name: '선택기' });
  const strip = within(tab.closest('.dv-tabs-and-actions-container')!);
  await strip.findByRole('button', { name: '더보기' });
  act(() => { tab.focus(); });
  await user.keyboard('{Shift>}{F10}{/Shift}');
  const popup = await screen.findByRole('dialog', { name: '더보기' });
  const layoutActions = within(popup).getByRole('group', { name: '배치' });
  return { tab, user, layoutActions };
}

it.each(['위로 접기', '숨기기', '삭제'])('hands focus off when a secondary chart is removed with %s from merged More', async action => {
  const { tab, user, layoutActions } = await openMergedChartActions();
  const command = within(layoutActions).getByRole('button', { name: action });
  act(() => { command.focus(); });
  await user.keyboard('{Enter}');
  await waitFor(() => { expect(tab).not.toBeInTheDocument(); });
  if (action === '삭제') expect(screen.getByRole('button', { name: '숨긴 패널 0' })).toBeDisabled();
  const target = action === '위로 접기'
    ? screen.getByRole('button', { name: '선택기' })
    : screen.getByRole('tab', { name: '추세' });
  await waitFor(() => { expect(target).toHaveFocus(); });
});

it('describes and blocks keyboard deletion of a kept chart in the merged layout actions', async () => {
  const reason = { ko: '다른 패널이 이 값을 붙잡고 있습니다', en: 'Another panel holds this value' };
  const { tab, user, layoutActions } = await openMergedChartActions({ reason });
  const command = within(layoutActions).getByRole('button', { name: '삭제' });
  expect(command).toHaveAttribute('aria-disabled', 'true');
  expect(command).toHaveAccessibleDescription(reason.ko);
  act(() => { command.focus(); });
  await user.keyboard('{Enter}');
  expect(command).toHaveFocus();
  expect(tab).toBeInTheDocument();
});

it('returns focus to the merged chart More trigger after closing panel settings with Escape', async () => {
  const user = userEvent.setup();
  const panel = { id: 'selector', source: { kind: 'declared', panel: 'selector' } as const, inputs: [], outputs: [] };
  const title = { ko: '선택기', en: 'Selector' };
  function WorkspaceWithSettings() {
    const { ref } = useDetailPanelSlotHost();
    const [opener, setOpener] = useState<HTMLButtonElement | null>(null);
    return <>
      <PanelWorkspace {...BASE} panels={PANELS.map(item => item.id === panel.id ? {
        ...item, onOpenSettings: setOpener,
        render: () => <AnalysisChartFrame chartId="secondary" title="Secondary chart" unit="s" series={[]} xType="category" />,
      } : item)} />
      <aside ref={ref} />
      {opener && <PanelSettingsDrawer panel={panel} title={title} value={{ version: 1, instances: [panel] }}
        trigger={opener} selectionOf={() => null} onChange={vi.fn()} onClose={() => { setOpener(null); }} />}
    </>;
  }

  render(shell(<DetailPanelSlotProvider><WorkspaceWithSettings /></DetailPanelSlotProvider>));
  await ready();
  const tab = screen.getByRole('tab', { name: title.ko });
  const strip = within(tab.closest('.dv-tabs-and-actions-container')!);
  const trigger = await strip.findByRole('button', { name: '더보기' });
  await user.click(trigger);
  const popup = await screen.findByRole('dialog', { name: '더보기' });
  await user.click(within(popup).getByRole('button', { name: '패널 설정' }));
  const drawer = await screen.findByRole('dialog', { name: title.ko });
  expect(popup).not.toBeInTheDocument();
  await waitFor(() => { expect(drawer.contains(document.activeElement)).toBe(true); });
  await user.keyboard('{Escape}');
  expect(drawer).not.toBeInTheDocument();
  await waitFor(() => { expect(trigger).toHaveFocus(); });
});
