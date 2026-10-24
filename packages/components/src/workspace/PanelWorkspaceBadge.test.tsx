import { useEffect, type ReactNode } from 'react';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { House } from 'lucide-react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type PlatformAdapter, groupId, spaceId } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { WorkspaceCommandsHost, useWorkspaceCommands, type WorkspaceCommand } from '../dock';
import { installResizeObserver } from '../dock/__tests__/harness';
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
const PERIOD = '/?from=2026-09-01T00:00:00&to=2026-09-02T00:00:00';

const mounts: Record<string, number> = {};
const setItem = vi.fn();
function Probe({ id }: { id: string }) {
  useEffect(() => { mounts[id] = (mounts[id] ?? 0) + 1; }, [id]);
  return <div data-testid={`probe-${id}`}>probe {id}</div>;
}
const group = (panels: string[], active?: string): PanelWorkspaceLayout => ({ type: 'group', panels, active });
const PANELS: PanelWorkspaceProps['panels'] = [
  { id: 'trend', title: { ko: '추세', en: 'Trend' }, primary: true, render: () => <Probe id="trend" /> },
  { id: 'selector', title: { ko: '선택기', en: 'Selector' }, render: () => <Probe id="selector" /> },
  { id: 'detail', title: { ko: '상세', en: 'Detail' }, render: () => <Probe id="detail" /> },
];
const PRESETS: PanelWorkspaceProps['presets'] = [
  { id: 'tabs', label: { ko: '묶음', en: 'Tabs' }, layout: group(['trend', 'selector', 'detail'], 'trend') },
];
const BASE: PanelWorkspaceProps = { panels: PANELS, presets: PRESETS, initialPreset: 'tabs', persistKey: 'main', label: { ko: '분석 패널', en: 'Analysis panels' } };
const withBadges = (badges: Record<string, PanelWorkspaceProps['panels'][number]['badge']>): PanelWorkspaceProps['panels'] => PANELS.map(panel => ({ ...panel, badge: badges[panel.id] }));
const SELECTOR_BADGE = { count: 2, description: { ko: '행 2개 추가됨', en: '2 rows added' } };
const WARNING_BADGE = { count: 3, tone: 'warning' as const, description: { ko: '일부 데이터 없음', en: 'Partial data' } };

const session = testSession(['platform:view'], { user: { id: 'u1', name: 'u', title: { ko: 'u', en: 'u' } } });
function shell(children: ReactNode) {
  const adapter = testAdapter({ session: () => session, menuQuery: (async () => ({})) as unknown as PlatformAdapter['menuQuery'] });
  return <I18nProvider><PlatformProvider adapter={adapter} registry={registry}>{children}</PlatformProvider></I18nProvider>;
}
const ui = (props: Partial<PanelWorkspaceProps> = {}) => shell(<PanelWorkspace {...BASE} {...props} />);
const ready = async () => {
  await screen.findAllByRole('tab');
  await waitFor(() => { expect(document.querySelectorAll('[data-dock-visible="true"]').length).toBeGreaterThan(0); });
};
const settle = () => act(() => new Promise<void>(resolve => { setTimeout(resolve, 30); }));
const tab = (id: string) => document.querySelector<HTMLElement>(`[role="tab"][data-tab-panel-id="${id}"]`)!;
const hide = async (menuButton: string) => {
  const id = { '선택기 동작': 'selector', '상세 동작': 'detail' }[menuButton]!;
  await userEvent.click(tab(id));
  await userEvent.click(screen.getAllByRole('button', { name: menuButton })[0]!);
  await userEvent.click(await screen.findByRole('menuitem', { name: '숨기기' }));
  await settle();
};

beforeEach(() => {
  for (const key of Object.keys(mounts)) delete mounts[key];
  setItem.mockClear();
  const memory = memoryStorage();
  vi.stubGlobal('localStorage', { ...memory, setItem: (key: string, value: string) => { setItem(key, value); memory.setItem(key, value); } } as Storage);
  vi.stubGlobal('sessionStorage', memoryStorage());
  window.history.replaceState(null, '', PERIOD);
  observer.resize(1200, 600);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('PanelWorkspace panel badge: tab', () => {
  it('draws the count, a warning icon with the count, and 99+ above 99; the title text and the tab name are unchanged', async () => {
    const plain = render(ui());
    await ready();
    const names = ['trend', 'selector', 'detail'].map(id => tab(id).getAttribute('aria-label') ?? tab(id).textContent);
    plain.unmount();
    render(ui({ panels: withBadges({ selector: SELECTOR_BADGE, detail: { ...WARNING_BADGE, count: 120 } }) }));
    await ready();
    expect(within(tab('selector')).getByText('2')).toBeInTheDocument();
    expect(tab('selector').querySelector('svg')).toBeNull();
    expect(within(tab('detail')).getByText('99+')).toBeInTheDocument();
    expect(tab('detail').querySelector('svg')).not.toBeNull();
    expect(tab('trend').querySelector('[data-panel-badge]')).toBeNull();
    expect(['trend', 'selector', 'detail'].map(id => { const mark = tab(id).querySelector('[data-dock-tab]')!; return mark.firstElementChild?.matches('span.truncate') ? mark.firstElementChild.textContent : mark.textContent; })).toEqual(['추세', '선택기', '상세']);
    expect(['trend', 'selector', 'detail'].map(id => tab(id).getAttribute('aria-label') ?? tab(id).textContent!.replace(/\d+\+?$/, ''))).toEqual(names);
    expect(screen.getByRole('tab', { name: '선택기' })).toBe(tab('selector'));
    expect(screen.getByRole('tab', { name: '상세' })).toBe(tab('detail'));
    expect(tab('selector').querySelector('[data-dock-tab-shrinkable]')).toBeNull();
    expect(tab('selector').querySelector('[data-panel-badge]')).toHaveAttribute('aria-hidden', 'true');
  });

  it('puts the description in the tab aria-description and leaves badge-less tabs without one', async () => {
    render(ui({ panels: withBadges({ selector: SELECTOR_BADGE }) }));
    await ready();
    await waitFor(() => { expect(tab('selector')).toHaveAttribute('aria-description', '행 2개 추가됨'); });
    expect(tab('trend')).not.toHaveAttribute('aria-description');
    expect(tab('selector').querySelector('[aria-live], [role="status"]')).toBeNull();
  });

  it('keeps the tab markup of a workspace without a badge', async () => {
    render(ui());
    await ready();
    expect(tab('selector').querySelector('[data-dock-tab]')!.innerHTML).toBe('선택기');
    expect(tab('selector')).not.toHaveAttribute('aria-description');
    expect(document.querySelector('[data-panel-badge]')).toBeNull();
  });

  it('changing the badge updates the tab without remounting any panel', async () => {
    const view = render(ui());
    await ready();
    await userEvent.click(tab('selector'));
    await userEvent.click(tab('trend'));
    const before = { ...mounts };
    view.rerender(ui({ panels: withBadges({ selector: SELECTOR_BADGE }) }));
    await waitFor(() => { expect(within(tab('selector')).getByText('2')).toBeInTheDocument(); });
    view.rerender(ui({ panels: withBadges({ selector: { ...SELECTOR_BADGE, count: 5 }, trend: WARNING_BADGE }) }));
    await waitFor(() => { expect(within(tab('selector')).getByText('5')).toBeInTheDocument(); });
    expect(within(tab('trend')).getByText('3')).toBeInTheDocument();
    view.rerender(ui());
    await waitFor(() => { expect(document.querySelector('[data-panel-badge]')).toBeNull(); });
    expect(mounts).toEqual(before);
  });
});

describe('PanelWorkspace panel badge: hidden panels', () => {
  it('marks the 숨긴 패널 button for a hidden warning and gives each 다시 보기 item its description', async () => {
    render(ui({ panels: withBadges({ selector: SELECTOR_BADGE, detail: WARNING_BADGE }) }));
    await ready();
    await hide('선택기 동작');
    const button = screen.getByRole('button', { name: '숨긴 패널 1' });
    expect(button.querySelector('[data-hidden-warning]')).toBeNull();
    await hide('상세 동작');
    const warned = screen.getByRole('button', { name: '숨긴 패널 2' });
    expect(warned.querySelector('[data-hidden-warning]')).not.toBeNull();
    expect(warned).toHaveAccessibleDescription('일부 데이터 없음');
    await userEvent.click(warned);
    expect(await screen.findByRole('menuitem', { name: /선택기 다시 보기/ })).toHaveTextContent('행 2개 추가됨');
    expect(screen.getByRole('menuitem', { name: /상세 다시 보기/ })).toHaveTextContent('일부 데이터 없음');
  });

  it('a hidden panel with a neutral badge shows no warning mark', async () => {
    render(ui({ panels: withBadges({ selector: SELECTOR_BADGE }) }));
    await ready();
    await hide('선택기 동작');
    expect(screen.getByRole('button', { name: '숨긴 패널 1' }).querySelector('[data-hidden-warning]')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: '숨긴 패널 1' }));
    expect(await screen.findByRole('menuitem', { name: /선택기 다시 보기/ })).toHaveTextContent('행 2개 추가됨');
  });

  it('hands a host the description and warning of a hidden panel as command fields', async () => {
    let commands: readonly WorkspaceCommand[] = [];
    function Reader() { commands = useWorkspaceCommands(); return null; }
    render(shell(<WorkspaceCommandsHost><Reader /><PanelWorkspace {...BASE} panels={withBadges({ detail: WARNING_BADGE })} /></WorkspaceCommandsHost>));
    await ready();
    await hide('상세 동작');
    await waitFor(() => { expect(commands.map(command => command.id)).toContain('show:detail'); });
    const show = commands.find(command => command.id === 'show:detail')!;
    expect([show.label, show.description, show.warning]).toEqual(['상세 다시 보기', '일부 데이터 없음', true]);
  });
});
