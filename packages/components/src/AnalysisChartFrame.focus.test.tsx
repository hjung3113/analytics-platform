import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry, useDrill, usePlatform } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { AnalysisChartFrame } from './AnalysisChartFrame';
import { DrillLayout } from './DrillLayout';
import { PlatformPage } from './PlatformPage';
import { groupId, spaceId } from '@ap/contracts';

vi.mock('./EChartImpl', () => ({ default: () => <div role="img" aria-label="Plot" /> }));
const registry = createRegistry({
  spaces: [testSpace()], groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('analytics') }],
  menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'analysis', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: ['step', 'mark'], contextResetKeys: ['step'], drill: { levels: [{ key: 'step', label: { ko: '단계', en: 'Step' } }] } }],
});
const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session });
function Consumer() {
  const drill = useDrill();
  return <PlatformPage><DrillLayout><AnalysisChartFrame chartId="focus" title="Focus" xType="category" unit="s"
    series={[{ id: 'one', name: 'One', color: 'chart-blue', points: [['A', 2]] }]}
    pointActions={[{ id: 'drill', label: 'Enter', onSelect: point => drill.enter('step', point.x) }]} /></DrillLayout></PlatformPage>;
}
function StayConsumer() {
  const { setPage } = usePlatform();
  return <PlatformPage><DrillLayout><AnalysisChartFrame chartId="stay" title="Stay" xType="category" unit="s"
    series={[{ id: 'one', name: 'One', color: 'chart-blue', points: [['A', 2]] }]}
    pointActions={[{ id: 'mark', label: 'Mark', keepsFocus: true, onSelect: point => setPage({ mark: point.x }) }]} /></DrillLayout></PlatformPage>;
}
afterEach(cleanup);

describe('AnalysisChartFrame action menu focus (#541 C2)', () => {
  it.each(['chart', 'toolbar', 'drill'] as const)('preserves the focus destination after %s closes the menu', async method => {
    window.history.replaceState(null, '', '/?v=1');
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><Consumer /></PlatformProvider></I18nProvider>);
    await screen.findByRole('img');
    const chart = screen.getByRole('group', { name: '차트 지점' });
    const toolbar = screen.getByRole('button', { name: '지점 동작' });
    const opener = method === 'toolbar' ? toolbar : chart;
    act(() => opener.focus());
    if (method === 'toolbar') fireEvent.keyDown(toolbar, { key: 'ArrowDown' });
    else fireEvent.keyDown(chart, { key: 'F10', shiftKey: true });
    const menu = await screen.findByRole('menu');
    if (method === 'drill') fireEvent.click(screen.getByRole('menuitem', { name: 'Enter' }));
    else fireEvent.keyDown(menu, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    // Radix FocusScope restores focus in a deferred unmount callback.
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    if (method === 'drill') {
      expect(document.activeElement).toBe(screen.getByRole('button', { name: '단계: A' }));
      expect(screen.getByRole('group', { name: '차트 지점' })).toBe(chart);
    } else expect(document.activeElement).toBe(opener);
  });

  it('keepsFocus: an action that writes a page key still returns focus to 지점 동작', async () => {
    window.history.replaceState(null, '', '/?v=1&step=A');
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><StayConsumer /></PlatformProvider></I18nProvider>);
    await screen.findByRole('img');
    const toolbar = screen.getByRole('button', { name: '지점 동작' });
    act(() => toolbar.focus());
    fireEvent.keyDown(toolbar, { key: 'ArrowDown' });
    await screen.findByRole('menu');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mark' }));
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(window.location.search).toContain('mark=A');
    expect(document.activeElement).toBe(toolbar);
  });
});
