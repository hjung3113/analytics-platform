import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import type { EChartProps } from '../EChart';
import { mount } from './test-support';

let plot: EChartProps;
vi.mock('../EChartImpl', () => ({ default: (props: EChartProps) => { plot = props; return <div role="img" aria-label={props.ariaLabel} />; } }));
const csv = vi.hoisted(() => vi.fn());
vi.mock('../analysisChartCsv', () => ({ downloadChartCsv: csv }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('offers a keyboard table and CSV with status but no selection, brush or drill', async () => {
  mount({ kind: 'histogram', xLabel: 'Duration', xUnit: 's', bins: [{ start: 6, end: 7, count: 2 }],
    binStatus: () => ({ tone: 'danger', label: 'Exceeded', reason: 'Above bound' }) }, true);
  await screen.findByRole('img');
  const user = userEvent.setup();
  screen.getByRole('button', { name: '표로 보기' }).focus();
  await user.keyboard('{Enter}');
  expect(screen.getByRole('table')).toHaveTextContent('6 s7 s2100%■ Exceeded · Above bound');
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.queryByRole('button', { name: '끌어서 선택' })).toBeNull();
  expect(screen.queryByRole('button', { name: '상세' })).toBeNull();
  expect(screen.queryByRole('region', { name: '선택 요약' })).toBeNull();
  act(() => plot.onEvents?.click?.({ componentType: 'series', seriesIndex: 0, dataIndex: 0 }, {} as never));
  expect(screen.queryByRole('checkbox')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '내보내기' }));
  expect(csv).toHaveBeenCalledWith(expect.objectContaining({ chartId: 'test' }), expect.arrayContaining(['상태', '사유']), [[6, 7, 2, 100, '■ Exceeded', 'Above bound']]);
});

it('uses the standard empty state', () => {
  mount({ kind: 'histogram', xLabel: 'Duration', xUnit: 's', values: [] });
  expect(screen.getByText('데이터 없음')).toBeTruthy();
  expect(screen.queryByRole('img')).toBeNull();
});
