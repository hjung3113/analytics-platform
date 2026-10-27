// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import type { HwTimeBlock, HwTimeRow } from '../../endpoints';
import { RankingPanel } from './RankingPanel';

afterEach(cleanup);

const row = (n: number, values: Record<string, number | null>): HwTimeRow => ({ id: `EQ-${String(n).padStart(3, '0')}`, equipmentId: `EQ-${String(n).padStart(3, '0')}`, values, total: null });
const block = (rows: HwTimeRow[]): HwTimeBlock => ({ series: [{ id: 'A', name: 'A', color: 'chart-blue' }, { id: 'B', name: 'B', color: 'chart-blue' }], rows, totals: { values: {}, total: null } });
const mount = (rows: HwTimeRow[], limit?: number) => render(<I18nProvider><RankingPanel block={block(rows)} visibleSeriesIds={['A', 'B']} limit={limit} /></I18nProvider>);

describe('RankingPanel', () => {
  it('fully measured, untruncated data shows totals only: no marker, no count line', () => {
    mount([row(1, { A: 1, B: 2 }), row(2, { A: 3, B: 4 })]);
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items.map(item => item.textContent)).toEqual(['1. EQ-0027.00 초', '2. EQ-0013.00 초']);
    expect(screen.queryByText('미측정 포함')).toBeNull();
    expect(screen.queryByText(/전체/)).toBeNull();
  });

  it('a row with some unmeasured values keeps the measured sum and carries a 미측정 포함 marker; a fully unmeasured row reads 미측정', () => {
    mount([row(1, { A: 1, B: 2 }), row(2, { A: 5, B: null }), row(3, { A: null, B: null })]);
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items[0]!.textContent).toContain('EQ-002');
    expect(items[0]!.textContent).toContain('≥ 5.00');
    expect(items[1]!.textContent).not.toContain('≥');
    expect(within(items[0]!).getByText('미측정 포함')).toBeTruthy();
    expect(within(items[1]!).queryByText('미측정 포함')).toBeNull();
    expect(items[2]!.textContent).toContain('미측정');
    expect(within(items[2]!).queryByText('미측정 포함')).toBeNull();
  });

  it('a truncated list says 상위 <n>행 / 전체 <m>행', () => {
    mount(Array.from({ length: 7 }, (_, i) => row(i + 1, { A: i, B: 1 })), 5);
    expect(screen.getByText('상위 5행 / 전체 7행')).toBeTruthy();
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(5);
  });
});
