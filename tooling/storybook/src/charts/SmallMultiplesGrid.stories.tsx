import type { Meta, StoryObj } from '@storybook/react-vite';
import { formatDateTime } from '@ap/contracts';
import { SmallMultiplesGrid, type SmallMultiplesSeries } from '@ap/components';
import { platformDecorator } from '../platform';

const output = { panelId: 'trends', key: 'asset' };
const title = { ko: '설비별 처리 시간', en: 'Processing time by asset' };
const series: SmallMultiplesSeries[] = Array.from({ length: 200 }, (_, i) => ({
  id: `series-${i}`, label: `EQ-${i + 1}`, selectionValue: `eq-${i + 1}`,
  points: Array.from({ length: 21 }, (_, day) => ({
    x: formatDateTime(new Date(Date.UTC(2026, 10, day + 1))), y: i % 8 + (day * 7 + i) % 11,
    status: i % 7 === 0 && day === 10 ? { tone: 'danger', label: '점검 필요' } : undefined,
  })),
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
