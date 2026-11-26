import type { Meta, StoryObj } from '@storybook/react-vite';
import { formatDateTime } from '@ap/contracts';
import { SmallMultiplesGrid, type SmallMultiplesSeries, type SmallMultiplesSortOption } from '@ap/components';
import { platformDecorator } from '../platform';

const output = { panelId: 'trends', key: 'asset' };
const title = { ko: '설비별 처리 시간', en: 'Processing time by asset' };
const over = { tone: 'danger', label: '상한 초과' } as const;
const under = { tone: 'warning', label: '하한 미달' } as const;
// Most tiles stay inside the band; every 7th climbs over the upper bound in the last week, every 11th dips under the lower bound.
const value = (i: number, day: number) => {
  const base = 6 + (i % 5) + ((day * 7 + i) % 5) * 0.6;
  if (i % 7 === 0 && day >= 15) return 13 + (day - 15) * 0.8;
  if (i % 11 === 3 && (day === 9 || day === 10)) return 0.8;
  return base;
};
const series: SmallMultiplesSeries[] = Array.from({ length: 200 }, (_, i) => ({
  id: `series-${i}`, label: `EQ-${i + 1}`, selectionValue: `eq-${i + 1}`,
  points: Array.from({ length: 21 }, (_, day) => {
    const y = value(i, day);
    const upper = day < 11 ? 15 : 13;
    return { x: formatDateTime(new Date(Date.UTC(2026, 10, day + 1))), y, status: y > upper ? over : y < 2 ? under : undefined };
  }),
  bounds: new Map([['2026-11-01T00:00:00', { lower: 2, upper: 15 }], ['2026-11-12T00:00:00', { lower: 2, upper: 13 }]]),
}));

const meta = {
  title: '데이터 시각화/작은 다중 차트', component: SmallMultiplesGrid,
  decorators: [platformDecorator({ menu: { pageKeys: [output.key], repeatedPageKeys: [output.key], contextResetKeys: [output.key],
    panels: [{ id: output.panelId, title, grain: 'asset', queryInputs: {}, displayInputs: {}, endpoints: [],
      outputs: [{ key: output.key, action: 'select', selection: { dimension: 'asset', shape: 'set' } }] }],
  } })],
  args: { title: title.ko, unit: 'ms', series, analysisSelectionOutput: output },
  render: args => <div className="h-96"><SmallMultiplesGrid {...args} /></div>,
} satisfies Meta<typeof SmallMultiplesGrid>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SharedAxis: Story = {};
export const Compact: Story = { args: { density: 'compact' } };

const breachCounts = new Map(series.map(item => [item.id, item.points.filter(point => point.status).length]));
const sortOptions: SmallMultiplesSortOption[] = [{
  id: 'breaches',
  label: { ko: '이탈 많은 순', en: 'Most breaches first' },
  compare: (a, b) => (breachCounts.get(b.id) ?? 0) - (breachCounts.get(a.id) ?? 0),
}];

export const DisplayOptions: Story = { args: { sortOptions, showAxisControl: true, showDensityControl: true } };
