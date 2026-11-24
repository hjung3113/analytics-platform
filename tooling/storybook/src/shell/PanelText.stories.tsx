import type { Meta, StoryObj } from '@storybook/react-vite';
import { NestedTextBlock, PanelSectionTitle, PanelTitleBlock, StatusBadge } from '@ap/ui';
import { guidedPage } from '../guidance';

/** 상세 패널 본문의 글 조각. `PanelTitleBlock`은 제목과 배지 줄, `PanelSectionTitle`은 작은 대문자 섹션 제목(`h3`), `NestedTextBlock`은 인용·원문 상자. */
const meta = {
  title: '셸·패널/패널 글 조각',
  component: PanelTitleBlock,
  args: { title: 'EQ-0207 진공 알람 반복', badges: <><StatusBadge tone="warning">조치 필요</StatusBadge><StatusBadge tone="neutral">증착</StatusBadge></> },
  argTypes: { badges: { control: false } },
  decorators: [Story => <div className="w-detail-panel border border-border-subtle bg-surface-detail"><Story /></div>],
  parameters: {
    docs: {
      subtitle: '@ap/ui · packages/sdk/ui/src/panel/PanelTitleBlock.tsx · PanelSectionTitle.tsx · NestedTextBlock.tsx',
      page: guidedPage(),
    },
  },
} satisfies Meta<typeof PanelTitleBlock>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 제목과 배지 줄. */
export const TitleBlock: Story = {};

/** `size="xl"`: 큰 제목을 고른 화면. */
export const TitleXl: Story = { args: { size: 'xl' } };

/** 섹션 제목 아래 원문 상자(`PanelSectionTitle inset="panel"` + `NestedTextBlock`). */
export const SectionAndQuote: Story = {
  render: () => <div className="py-4">
    <PanelSectionTitle inset="panel">작업자 메모</PanelSectionTitle>
    <div className="px-4"><NestedTextBlock><p className="text-sm">11-12 02:10 챔버 B 압력 상승. 펌프 교체 뒤 재발, 밸브 점검 요청.</p></NestedTextBlock></div>
  </div>,
};
