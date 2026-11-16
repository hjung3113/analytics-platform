// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AnalysisChartProps } from '@ap/components';
import { VerdictDonut } from './NewPanels';
import type { HwTimeFilter } from '../../shared/useHwTimeFilter';

const { chart } = vi.hoisted(() => ({ chart: vi.fn() }));
vi.mock('@ap/kernel', async original => ({ ...await original<typeof import('@ap/kernel')>(),
  usePlatform: () => ({ setPage: vi.fn() }),
  useMessages: () => (key: string) => key,
}));
vi.mock('@ap/components', async original => ({ ...await original<typeof import('@ap/components')>(),
  AnalysisChart: (props: AnalysisChartProps) => { chart(props); return <div data-testid="donut-chart" />; },
}));
afterEach(() => { cleanup(); chart.mockClear(); });
const filter = { selectionFor: () => ({ modules: [], motions: [] }) } as unknown as HwTimeFilter;

describe('captured donut regressions', () => {
  it('keeps a minimum chart body inside the scrolling pinned row while still filling taller rows', () => {
    render(<VerdictDonut matrices={[]} filter={filter} verdict={null} />);
    const body = screen.getByTestId('donut-chart').parentElement!;
    // AnalysisChart has no fillMin prop: the menu supplies the floor including chart chrome.
    expect(body.classList.contains('min-h-80')).toBe(true);
    expect(body.classList.contains('flex-1')).toBe(true);
    expect(body.parentElement!.classList.contains('overflow-auto')).toBe(true);
    expect(chart.mock.calls.at(-1)![0].size).toBe('fill');
  });
  it('uses the HTM verdict tokens for all slices, retaining every legend label', () => {
    render(<VerdictDonut matrices={[]} filter={filter} verdict={null} />);
    expect(chart.mock.calls.at(-1)![0].spec.slices).toEqual([
      { id: 'normal', label: 'normal', value: 0, color: 'chart-status-good' },
      { id: 'over', label: 'over', value: 0, color: 'chart-status-critical' },
      { id: 'under', label: 'under', value: 0, color: 'chart-status-warn' },
      { id: 'unjudgeable', label: 'unjudgeable', value: 0, color: 'chart-series-4' },
    ]);
  });
});
