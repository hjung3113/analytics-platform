import type { Meta, StoryObj } from '@storybook/react-vite';
import { ToggleGroup, ToggleGroupItem } from '@ap/ui';
import { PROCESSES } from '../equipment';
import { guidedPage } from '../guidance';

/** 눌러 켜는 버튼 묶음. `type="single"`은 하나(화살표가 선택을 옮긴다), `type="multiple"`은 여럿을 켠다. */
const meta = {
  title: '폼/ToggleGroup',
  component: ToggleGroup,
  args: { type: 'multiple', defaultValue: ['식각', '증착'], 'aria-label': '공정' },
  render: args => <ToggleGroup {...args}>{PROCESSES.map(p => <ToggleGroupItem key={p} value={p}>{p}</ToggleGroupItem>)}</ToggleGroup>,
  // The on state fills with `surface-card`, so the group sits on the canvas as in a toolbar band.
  decorators: [Story => <div className="inline-flex rounded-md bg-surface-canvas p-3"><Story /></div>],
  parameters: {
    docs: {
      subtitle: '@ap/ui · packages/sdk/ui/src/components/shadcn/toggle-group.tsx',
      page: guidedPage(),
    },
  },
} satisfies Meta<typeof ToggleGroup>;
export default meta;
// The props are a union over `type`, which StoryObj<typeof meta> cannot narrow; stories pass plain args.
type Story = StoryObj;

/** 여럿 켜기(기본 변형). */
export const Multiple: Story = {};

/** 하나 켜기, 테두리 변형(`variant="outline"`, `size="sm"`). */
export const SingleOutline: Story = { args: { type: 'single', defaultValue: '식각', variant: 'outline', size: 'sm' } };

/** 필터 묶음(`appearance="filter"`)과 켠 항목의 선택 표식(항목 `appearance="selected-filter"`). */
export const Filter: Story = {
  render: () => <ToggleGroup type="multiple" appearance="filter" size="sm" defaultValue={['식각', '증착']} aria-label="공정">{PROCESSES.map(p => <ToggleGroupItem key={p} value={p} appearance="selected-filter">{p}</ToggleGroupItem>)}</ToggleGroup>,
};
