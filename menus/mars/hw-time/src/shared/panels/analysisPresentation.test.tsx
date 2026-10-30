// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import type { AnalysisChartFrameProps } from '@ap/components';
import { StackPanel } from './StackPanel';
import { TrendPanel } from './TrendPanel';

vi.mock('@ap/components', async importOriginal => {
  const actual = await importOriginal<typeof import('@ap/components')>();
  return { ...actual, AnalysisChartFrame: (p: AnalysisChartFrameProps) => <div data-testid={p.chartId}>{p.emphasisFocus}</div> };
});
afterEach(cleanup);

it('both real panel consumers declare gentle emphasis for arbitrary chart IDs (#1141)', () => {
  render(<I18nProvider>
    <StackPanel chartId="arbitrary-stack" title="Stack" block={{ series: [], rows: [], totals: { values: {}, total: 0 } }} visibleSeriesIds={[]} />
    <TrendPanel chartId="arbitrary-trend" title="Trend" rowIds={['row']} level={1} query={{ status: 'done', missing: [], completedAt: 1, refetch: () => {}, response: { outcome: 'ok', data: { limits: { maxRows: 8 }, rows: [{ id: 'row', points: [] }] }, trust: null, assessments: [], correlationId: 'fixture' } }} />
  </I18nProvider>);
  expect(screen.getByTestId('arbitrary-stack').textContent).toBe('none');
  expect(screen.getByTestId('arbitrary-trend').textContent).toBe('none');
});
