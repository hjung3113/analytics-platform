import { useEffect, type ReactElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ECharts } from 'echarts/core';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { AnalysisChartFrame, type ChartSeries } from './AnalysisChartFrame';
import { baseTextStyle, chartTheme, strokeToken, token, type EChartProps } from './EChart';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';

// Regression test for the #48 P1 finding: the echarts-dependent implementation is code-split,
// so the chart instance can appear after the parent already handled a Brush click. This mocks
// the './EChartImpl' chunk import with a delayed resolution.
type FakeInstance = { dispatchAction: Mock; setOption: Mock; on: Mock; off: Mock; resize: Mock; dispose: Mock; getWidth: Mock };
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
    const instance: FakeInstance = { dispatchAction: vi.fn(), setOption: vi.fn(), on: vi.fn(), off: vi.fn(), resize: vi.fn(), dispose: vi.fn(), getWidth: vi.fn(() => 640) };
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
const session = testSession(['platform:view'], { user: { id: 'user-a' } });
const adapter = testAdapter({ session: () => session });

const series: ChartSeries[] = [{ id: 's1', name: 'S1', color: 'chart-blue', points: [['2026-09-01T00:00:00', 1], ['2026-09-02T00:00:00', 2]] }];

describe('EChart lazy chunk readiness (P1)', () => {
  it('replays the brush cursor once the impl instance exists after a Brush click during loading', async () => {
    implState.delayMs = 30;
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
      <AnalysisChartFrame chartId="c1" title="Chart" series={series} unit="ea" />
    </PlatformProvider></I18nProvider>);
    expect(screen.queryByTestId('chart-plot')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '구간 선택' }));
    expect(screen.getByRole('button', { name: '구간 선택' })).toHaveAttribute('aria-pressed', 'true');

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

describe('ECharts base theme (#544)', () => {
  it('resolves existing axis and reference roles and token-backed tooltip roles', () => {
    const root = document.documentElement;
    const values = {
      '--border-strong': '184 196 214',
      '--chart-grid': '237 241 247',
      '--text-muted': '102 112 131',
      '--surface-popover': '237 243 251',
      '--border-subtle': '203 214 230',
      '--text-primary': '16 24 40',
      '--text-secondary': '55 65 81',
    };
    const previous = new Map(Object.keys(values).map(name => [name, root.style.getPropertyValue(name)]));
    for (const [name, value] of Object.entries(values)) root.style.setProperty(name, value);

    try {
      const theme = chartTheme();
      expect(theme.axisLine.lineStyle.color).toBe('rgb(184,196,214)');
      expect(theme.splitLine.lineStyle.color).toBe('rgb(237,241,247)');
      expect(theme.axisLabel.color).toBe('rgb(102,112,131)');
      expect(theme.tooltip.backgroundColor).toBe('rgb(237,243,251)');
      expect(theme.tooltip.borderColor).toBe('rgb(203,214,230)');
      expect(theme.tooltip.textStyle.color).toBe('rgb(16,24,40)');
      expect(theme.referenceLine).toEqual({
        silent: true,
        symbol: 'none',
        lineStyle: { color: 'rgb(55,65,81)', type: 'dashed' },
        label: { formatter: '{b}', fontSize: 10, color: 'rgb(55,65,81)', position: 'insideEndTop' },
      });
      expect(token('border-strong')).toBe(theme.axisLine.lineStyle.color);
      expect(token('chart-grid')).toBe(theme.splitLine.lineStyle.color);
    } finally {
      for (const [name, value] of previous) {
        if (value) root.style.setProperty(name, value); else root.style.removeProperty(name);
      }
    }
  });

  it.each([
    ['chart-series-1', 'chart-series-1-stroke'],
    ['chart-series-2', 'chart-series-2-stroke'],
    ['chart-series-3', 'chart-series-3-stroke'],
    ['chart-series-4', 'chart-series-4-stroke'],
  ])('maps %s to its stroke token', (series, stroke) => {
    expect(strokeToken(series as never)).toBe(stroke);
  });
});
