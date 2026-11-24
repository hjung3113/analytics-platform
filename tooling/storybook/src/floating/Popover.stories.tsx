import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, Popover, PopoverContent, PopoverTrigger } from '@ap/ui';
import { guidedPage } from '../guidance';

/** 트리거 옆에 뜨는 비모달 표면. 짧은 설명이나 설정 묶음을 본문 위에 잠시 띄운다. */
const meta = {
  title: '떠 있는 표면/Popover',
  component: Popover,
  args: { open: true },
  parameters: {
    docs: {
      // Each story in its own frame, so the open surface stays inside its box on the docs page.
      story: { inline: false, iframeHeight: 240 },
      subtitle: '@ap/ui · packages/sdk/ui/src/components/shadcn/popover.tsx',
      page: guidedPage(
        [['docs/contract/components.md', 'Shadow는 Popover/Dropdown/Drawer/Modal 같은'], ['DESIGN.md', 'copy Tooltip과 표 column menu도 공유 floating 표면']],
        [['DESIGN.md', '표에 따로 둔']],
      ),
    },
  },
  render: args => <div className="p-6"><Popover {...args}>
    <PopoverTrigger asChild><Button size="toolbar" variant="secondary">EQ-0207 조회 정보</Button></PopoverTrigger>
    <PopoverContent align="start">
      <p className="t-card-title mb-1">증착 · EQ-0207</p>
      <p className="text-sm text-text-secondary">가동률 72.5% · 사이클타임 176초 · 알람 9건. 최근 24시간 기준.</p>
    </PopoverContent>
  </Popover></div>,
} satisfies Meta<typeof Popover>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 열린 상태(`open`), 기본 여백. */
export const Open: Story = {};

/** 촘촘한 여백(`padding="compact"`): 목록형 내용. */
export const Compact: Story = {
  render: args => <div className="p-6"><Popover {...args}>
    <PopoverTrigger asChild><Button size="toolbar" variant="secondary">공정</Button></PopoverTrigger>
    <PopoverContent align="start" padding="compact" className="w-48">
      {['식각', '증착', '세정'].map(p => <p key={p} className="rounded-sm px-2 py-1.5 text-sm">{p}</p>)}
    </PopoverContent>
  </Popover></div>,
};
