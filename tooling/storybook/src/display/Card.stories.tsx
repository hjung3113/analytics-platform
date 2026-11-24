import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@ap/ui';
import { guidedPage } from '../guidance';

/** 캔버스 위 최상위 카드(`elevation-panel`). 머리·본문·바닥 부품으로 나누거나, `padding="compact"`로 바로 내용을 담는다. */
const meta = {
  title: '표시/Card',
  component: Card,
  render: args => <Card {...args} className="w-96">
    <CardHeader><CardTitle>EQ-0207</CardTitle><CardDescription>증착 · 2라인</CardDescription></CardHeader>
    <CardContent><p className="text-sm">최근 7일 가동률 72.5%, 알람 9건. 진공 알람이 절반을 넘습니다.</p></CardContent>
    <CardFooter><Button size="sm" variant="secondary">설비 이력</Button></CardFooter>
  </Card>,
  decorators: [Story => <div className="bg-surface-canvas p-6"><Story /></div>],
  parameters: {
    docs: {
      subtitle: '@ap/ui · packages/sdk/ui/src/components/shadcn/card.tsx',
      page: guidedPage(
        [['DESIGN.md', '최상위 카드와 분석 패널은 `elevation-panel`']],
        [['DESIGN.md', '카드마다 동일한 시각 강도를 주는 card soup를 피하고'], ['DESIGN.md', '카드 그림자를 겹치지 않고']],
      ),
    },
  },
} satisfies Meta<typeof Card>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 머리·본문·바닥. */
export const Default: Story = {};

/** 촘촘한 카드(`padding="compact"`): 부품 없이 내용을 바로 담는다. */
export const Compact: Story = {
  args: { padding: 'compact' },
  render: args => <Card {...args} className="w-72"><div className="t-card-title">오늘 알람</div><div className="t-mono mt-1 text-sm">27건</div></Card>,
};
