import type { Meta, StoryObj } from '@storybook/react-vite';
import { Checkbox, Label } from '@ap/ui';
import { guidedPage } from '../guidance';

/** 켜고 끄는 선택 하나. 일부만 고른 묶음은 `checked="indeterminate"`로 보인다. 라벨은 `Label`을 `htmlFor`로 잇는다. */
const meta = {
  title: '폼/Checkbox',
  component: Checkbox,
  args: { id: 'alarm-only', defaultChecked: true },
  render: args => <div className="flex items-center gap-2"><Checkbox {...args} /><Label htmlFor={args.id}>알람 있는 설비만</Label></div>,
  parameters: {
    docs: {
      subtitle: '@ap/ui · packages/sdk/ui/src/components/shadcn/checkbox.tsx',
      page: guidedPage(
        [['DESIGN.md', 'checkbox·검색·filter 경계는'], ['DESIGN.md', 'hover에서 focus와 selected checkbox/표식이 사라지지 않는다']],
        [['DESIGN.md', '소비자는 primitive 모양을 덮어쓰지 않는다']],
      ),
    },
  },
} satisfies Meta<typeof Checkbox>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 켠 상태. */
export const Checked: Story = {};

/** 끈 상태. */
export const Unchecked: Story = { args: { defaultChecked: false } };

/** 묶음 일부만 고른 상태(식각 설비 3대 중 2대). */
export const Indeterminate: Story = { args: { checked: 'indeterminate' }, render: args =>
  <div className="flex items-center gap-2"><Checkbox {...args} /><Label htmlFor={args.id}>식각 (2/3)</Label></div> };

/** 비활성. */
export const Disabled: Story = { args: { disabled: true } };
