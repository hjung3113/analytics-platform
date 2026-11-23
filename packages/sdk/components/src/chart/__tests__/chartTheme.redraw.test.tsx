import type { ReactElement } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import { AnalysisChartFrame } from '../AnalysisChartFrame';
import type { EChartProps } from '../EChart';
import { mount } from './test-support';

let plot: EChartProps;
vi.mock('../EChartImpl', () => ({ default: (props: EChartProps): ReactElement => { plot = props; return <div role="img" aria-label={props.ariaLabel} />; } }));

const root = document.documentElement;
/** Sets a token on the root and switches the theme attribute, as a theme override block would. */
const switchTheme = (theme: string | null, tokens: Record<string, string>) => act(() => {
  for (const [name, value] of Object.entries(tokens)) root.style.setProperty(name, value);
  if (theme === null) root.removeAttribute('data-theme'); else root.setAttribute('data-theme', theme);
});
/** MutationObserver callbacks run as microtasks: let them land inside act. */
const settle = () => act(() => Promise.resolve());

afterEach(() => {
  cleanup();
  root.removeAttribute('data-theme');
  for (const name of ['--chart-series-1', '--chart-blue', '--chart-blue-stroke']) root.style.removeProperty(name);
});

describe('open charts redraw when the root data-theme changes (#2723)', () => {
  it('AnalysisChart re-reads its colour tokens without a remount', async () => {
    root.style.setProperty('--chart-series-1', '1 2 3');
    mount({ kind: 'donut', slices: [{ id: 'a', label: 'A', value: 3 }, { id: 'b', label: 'B', value: 1 }] });
    await screen.findByRole('img');
    const first = () => (plot.option as { series: { data: { itemStyle: { color: string } }[] }[] }).series[0].data[0].itemStyle.color;
    expect(first()).toBe('rgb(1,2,3)');

    switchTheme('violet', { '--chart-series-1': '4 5 6' });
    await settle();
    expect(first()).toBe('rgb(4,5,6)');
  });

  it('AnalysisChartFrame re-reads series and stroke tokens without a remount', async () => {
    root.style.setProperty('--chart-blue', '1 2 3');
    root.style.setProperty('--chart-blue-stroke', '1 2 3');
    window.history.replaceState(null, '', '/?v=1&scopeId=MEM');
    render(<I18nProvider><AnalysisChartFrame chartId="theme" title="Theme" unit="ea"
      series={[{ id: 'a', name: 'A', color: 'chart-blue', points: [['2026-09-01T00:00:00', 1], ['2026-09-01T01:00:00', 2]] }]} /></I18nProvider>);
    await screen.findByRole('img');
    const line = () => (plot.option as { series: { id: string; lineStyle?: { color: string } }[] }).series.find(s => s.id === 'a')?.lineStyle?.color;
    expect(line()).toBe('rgb(1,2,3)');

    switchTheme('violet', { '--chart-blue-stroke': '7 8 9' });
    await settle();
    expect(line()).toBe('rgb(7,8,9)');
  });
});
