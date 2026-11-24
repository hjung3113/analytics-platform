import type { Meta, StoryObj } from '@storybook/react-vite';
import { HoverCard, HoverCardContent, HoverCardTrigger, UserChip } from '@ap/ui';
import { guidedPage } from '../guidance';

/** 링크·이름 위에 포인터를 올리면 뜨는 미리보기 카드. 포커스로는 열리지 않으므로 같은 정보를 다른 길로도 준다. */
const meta = {
  title: '떠 있는 표면/HoverCard',
  component: HoverCard,
  args: { open: true },
  parameters: {
    docs: {
      story: { inline: false, iframeHeight: 220 },
      subtitle: '@ap/ui · packages/sdk/ui/src/components/shadcn/hover-card.tsx',
      page: guidedPage(
        [['docs/contract/components.md', 'Shadow는 Popover/Dropdown/Drawer/Modal 같은']],
      ),
    },
  },
  render: args => <div className="p-6"><HoverCard {...args}>
    <HoverCardTrigger asChild><a href="#eq-0207" className="text-sm text-accent-primary underline">EQ-0207</a></HoverCardTrigger>
    <HoverCardContent align="start">
      <p className="t-card-title mb-1">EQ-0207 · 증착</p>
      <p className="mb-3 text-sm text-text-secondary">가동률 72.5% · 알람 9건(최근 7일)</p>
      <UserChip user={{ display_name: '홍길동' }} sub="설비 담당" size="sm" />
    </HoverCardContent>
  </HoverCard></div>,
} satisfies Meta<typeof HoverCard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 열린 미리보기. */
export const Open: Story = {};
