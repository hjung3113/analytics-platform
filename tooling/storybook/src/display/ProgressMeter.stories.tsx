import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProgressMeter } from '@ap/ui';
import { EQUIPMENT } from '../equipment';
import { guidedPage } from '../guidance';

/** 값 하나의 막대 표시(트랙과 채움). 의미가 있으면 `semantics`로 `meter`·`progressbar`와 이름을 주고, 옆 글자가 값을 말하면 `decorative`다. */
const meta = {
  title: '표시/ProgressMeter',
  component: ProgressMeter,
  args: { value: 72.5, trackTone: 'subtle', semantics: { role: 'meter', label: 'EQ-0207 가동률' } },
  decorators: [Story => <div className="w-60"><Story /></div>],
  parameters: {
    docs: {
      subtitle: '@ap/ui · packages/sdk/ui/src/indicators/ProgressMeter.tsx',
      page: guidedPage(),
    },
  },
} satisfies Meta<typeof ProgressMeter>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 가동률 72.5%(`meter`). */
export const Default: Story = {};

/** tone 네 가지, 얇은 막대(`size="thin"`). */
export const Tones: Story = {
  render: () => <div className="grid gap-3">{(['primary', 'success', 'warning', 'danger'] as const).map((tone, i) =>
    <ProgressMeter key={tone} tone={tone} size="thin" trackTone="subtle" value={[88, 94, 61, 23][i]!} semantics="decorative" />)}</div>,
};

/** 표 칸 안: 값 글자 옆의 장식 막대(`decorative`). */
export const InRows: Story = {
  render: () => <div className="grid gap-2 text-sm">{EQUIPMENT.slice(0, 4).map(e => <div key={e.id} className="grid grid-cols-[80px_48px_1fr] items-center gap-2">
    <span className="t-mono">{e.id}</span><span className="text-right tabular">{e.util.toFixed(1)}</span>
    <ProgressMeter value={e.util} trackTone="subtle" semantics="decorative" tone={e.util < 80 ? 'warning' : 'primary'} />
  </div>)}</div>,
};
