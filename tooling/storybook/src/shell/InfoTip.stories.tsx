import type { Meta, StoryObj } from '@storybook/react-vite';
import { InfoTip, PanelSectionTitle } from '@ap/ui';
import { guidedPage } from '../guidance';

/** 섹션의 정적 안내를 담는 24px ⓘ 버튼. hover·포커스로 툴팁이 열리고, 같은 글이 늘 있는 `sr-only` 설명으로 남는다. */
const meta = {
  title: '셸·패널/InfoTip',
  component: InfoTip,
  args: { label: '설명', children: '가동률은 계획 정지를 뺀 시간 중 실제로 가동한 시간의 비율이다.' },
  render: args => <div className="flex items-center gap-1"><PanelSectionTitle className="mb-0">가동률(7일)</PanelSectionTitle><InfoTip {...args} /></div>,
  parameters: {
    docs: {
      subtitle: '@ap/ui · packages/sdk/ui/src/panel/InfoTip.tsx',
      page: guidedPage([['docs/contract/components.md', '정적 안내 문장에만 쓴다']]),
    },
  },
} satisfies Meta<typeof InfoTip>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 섹션 제목 옆 ⓘ. */
export const Default: Story = {};
