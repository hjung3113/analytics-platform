import type { Meta, StoryObj } from '@storybook/react-vite';
import { Label, RadioGroup, RadioGroupItem } from '@ap/ui';
import { PROCESSES } from '../equipment';
import { guidedPage } from '../guidance';

/** 여럿 중 하나를 고른다. `appearance="segmented"`는 짧은 선택지를 한 줄 칸으로 묶는다. */
const meta = {
  title: '폼/RadioGroup',
  component: RadioGroup,
  args: { defaultValue: '식각', 'aria-label': '공정' },
  render: args => <RadioGroup {...args}>{PROCESSES.map(p => <div key={p} className="flex items-center gap-2">
    <RadioGroupItem id={`p-${p}`} value={p} /><Label htmlFor={`p-${p}`}>{p}</Label></div>)}</RadioGroup>,
  parameters: {
    docs: {
      subtitle: '@ap/ui · packages/sdk/ui/src/components/shadcn/radio-group.tsx',
      page: guidedPage(
        [['DESIGN.md', 'segmented 선택은 공유 segmented `RadioGroup`']],
        [['DESIGN.md', '소비자는 primitive 모양을 덮어쓰지 않는다']],
      ),
    },
  },
} satisfies Meta<typeof RadioGroup>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 세로 목록. */
export const Default: Story = {};

/** segmented: 집계 단위처럼 짧은 선택지. 항목에도 같은 `appearance`를 준다. */
export const Segmented: Story = {
  args: { appearance: 'segmented', defaultValue: 'day', 'aria-label': '집계 단위' },
  render: args => <RadioGroup {...args}>{[['hour', '시간'], ['day', '일'], ['week', '주']].map(([value, label]) =>
    <RadioGroupItem key={value} appearance="segmented" value={value!}>{label}</RadioGroupItem>)}</RadioGroup>,
};

/** 항목 하나(세정)가 비활성. */
export const DisabledItem: Story = {
  render: args => <RadioGroup {...args}>{PROCESSES.map(p => <div key={p} className="flex items-center gap-2">
    <RadioGroupItem id={`d-${p}`} value={p} disabled={p === '세정'} /><Label htmlFor={`d-${p}`}>{p}</Label></div>)}</RadioGroup>,
};
