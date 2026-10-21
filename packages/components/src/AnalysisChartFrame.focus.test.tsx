import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry, useDrill } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { AnalysisChartFrame } from './AnalysisChartFrame';
import { DrillLayout } from './DrillLayout';
import { PlatformPage } from './PlatformPage';

vi.mock('./EChartImpl', () => ({ default: () => <div role="img" aria-label="Plot" /> }));
const registry = createRegistry({
  spaces: [testSpace()], groups: [{ id: 'overview', label: { ko: '개요', en: 'Overview' }, icon: House, space: 'analytics' }],
  menus: [{ id: 'home', group: 'overview', primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'analysis', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: ['step'], contextResetKeys: ['step'], drill: { levels: [{ key: 'step', label: { ko: '단계', en: 'Step' } }] } }],
});
const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session });
function Consumer() {
  const drill = useDrill();
  return <PlatformPage><DrillLayout><AnalysisChartFrame chartId="focus" title="Focus" xType="category" unit="s"
    series={[{ id: 'one', name: 'One', color: 'chart-blue', points: [['A', 2]] }]}
    pointActions={[{ id: 'drill', label: 'Enter', onSelect: point => drill.enter('step', point.x) }]} /></DrillLayout></PlatformPage>;
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
});
