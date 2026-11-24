import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, Callout } from '@ap/ui';
import { guidedPage } from '../guidance';

/** 상세 패널·내용 카드 안의 알림 상자. `tone`이 색을 정하고 제목·본문·동작을 담는다. `size="compact"`는 얇은 한 줄. */
const meta = {
  title: '표시/Callout',
  component: Callout,
  args: { tone: 'amber', title: '측정값 일부 누락', children: 'EQ-0207의 11-06~11-07 가동률이 수집되지 않아 평균에서 뺐습니다.' },
  decorators: [Story => <div className="w-[480px]"><Story /></div>],
  parameters: {
    docs: {
      subtitle: '@ap/ui · packages/sdk/ui/src/panel/Callout.tsx',
      page: guidedPage([['docs/contract/components.md', 'hover 전용 금지']]),
    },
  },
} satisfies Meta<typeof Callout>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 경고 톤, 제목과 본문. */
export const Default: Story = {};

/** 다섯 톤. */
export const Tones: Story = {
  render: args => <div className="space-y-2">{(['amber', 'red', 'blue', 'cyan', 'emerald'] as const).map(tone =>
    <Callout key={tone} {...args} tone={tone} title={tone}>{args.children}</Callout>)}</div>,
};

/** 동작 하나를 단 알림. */
export const WithAction: Story = { args: { tone: 'red', title: '진공 알람 반복', children: '최근 7일 같은 코드(A-102)가 9번 났습니다.',
  action: <Button size="toolbar" variant="secondary">알람 이력</Button> } };

/** `size="compact"`: 카드 안 얇은 한 줄. */
export const Compact: Story = { args: { tone: 'blue', title: undefined, size: 'compact', children: '전날 06:00까지 집계한 값입니다.' } };
