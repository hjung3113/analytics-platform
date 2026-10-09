import { useEffect, type ReactElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ECharts } from 'echarts/core';
import type { Session } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { AnalysisChartFrame, type ChartSeries } from './AnalysisChartFrame';
import { baseTextStyle, type EChartProps } from './EChart';
import { noContext, testAdapter, testSpace } from './test-support';

// Regression test for the #48 P1 finding: the echarts-dependent implementation is code-split,
// so the chart instance can appear after the parent already handled a Brush click. This mocks
// the './EChartImpl' chunk import with a delayed resolution.
type FakeInstance = { dispatchAction: Mock; setOption: Mock; on: Mock; off: Mock; resize: Mock; dispose: Mock };
const implState = vi.hoisted(() => ({
  delayMs: 0,
  instances: [] as FakeInstance[],
}));

vi.mock('./EChartImpl', () => {
  // new Promise form: @ap/tsconfig base lib is ES2022, so Promise.withResolvers is unavailable.
  return new Promise<{ default: (props: EChartProps) => ReactElement }>(resolve => setTimeout(() => resolve({ default: MockImpl }), implState.delayMs));
});

/** Stand-in for the real EChartImpl: creates a fake echarts instance and reports it via onReady. */
function MockImpl(props: EChartProps) {
  useEffect(() => {
    const instance: FakeInstance = { dispatchAction: vi.fn(), setOption: vi.fn(), on: vi.fn(), off: vi.fn(), resize: vi.fn(), dispose: vi.fn() };
    implState.instances.push(instance);
    props.onReady?.(instance as unknown as ECharts);
    return () => { instance.dispose(); };
  }, []);
  return <div data-testid="chart-plot" role="img" aria-label={props.ariaLabel} style={{ height: props.height, width: '100%' }} />;
}

afterEach(() => {
  cleanup();
  implState.delayMs = 0;
  implState.instances.length = 0;
});

const registry = createRegistry({
  spaces: [testSpace()],
  groups: [{ id: 'overview', label: { ko: '개요', en: 'Overview' }, icon: House, space: 'analytics' }],
  menus: [{ id: 'home', group: 'overview', primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'overview', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});
const session: Session = {
  user: { id: 'user-a', name: 'a', title: { ko: 'a', en: 'a' }, permissions: ['platform:view'] }, scopes: [],
};
const adapter = testAdapter({ session: () => session });

const series: ChartSeries[] = [{ id: 's1', name: 'S1', color: 'chart-blue', points: [['2026-09-01T00:00:00', 1], ['2026-09-02T00:00:00', 2]] }];

describe('EChart lazy chunk readiness (P1)', () => {
  it('replays the brush cursor once the impl instance exists after a Brush click during loading', async () => {
    implState.delayMs = 30;
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
      <AnalysisChartFrame chartId="c1" title="Chart" series={series} unit="ea" />
    </PlatformProvider></I18nProvider>);
    expect(screen.queryByTestId('chart-plot')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Brush' }));
    expect(screen.getByRole('button', { name: 'Brush' })).toHaveAttribute('aria-pressed', 'true');

    await screen.findByTestId('chart-plot', {}, { timeout: 2000 });
    await waitFor(() => expect(implState.instances[0].dispatchAction).toHaveBeenCalledWith({
      type: 'takeGlobalCursor', key: 'brush',
      brushOption: { brushType: 'lineX', brushMode: 'single' },
    }), { timeout: 2000 });
  });
});

describe('chart text tokens (#193)', () => {
  it('uses the FeedbackOps font fallback without the removed Noto family', () => {
    expect(baseTextStyle.fontFamily).toContain('Pretendard Variable');
    expect(baseTextStyle.fontFamily).not.toContain('Noto');
  });

  it('reads the current font and muted colour from CSS at draw time', () => {
    const root = document.documentElement;
    const oldFont = root.style.getPropertyValue('--font-sans');
    const oldColor = root.style.getPropertyValue('--text-muted');
    try {
      root.style.setProperty('--font-sans', "'Inter Variable', 'Pretendard Variable', sans-serif");
      root.style.setProperty('--text-muted', '102 112 131');
      expect(baseTextStyle.fontFamily).toBe("'Inter Variable', 'Pretendard Variable', sans-serif");
      expect(baseTextStyle.color).toBe('rgb(102,112,131)');
    } finally {
      if (oldFont) root.style.setProperty('--font-sans', oldFont); else root.style.removeProperty('--font-sans');
      if (oldColor) root.style.setProperty('--text-muted', oldColor); else root.style.removeProperty('--text-muted');
    }
  });
});
