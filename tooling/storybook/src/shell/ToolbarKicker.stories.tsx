import type { Meta, StoryObj } from '@storybook/react-vite';
import { ToolbarKicker } from '@ap/ui';
import { guidedPage } from '../guidance';

/** 빽빽한 작업대 툴바 앞에 두는 경로 표시: 작은 대문자 라벨 · 이름, 오른쪽 구분선. */
const meta = {
  title: '셸·패널/ToolbarKicker',
  component: ToolbarKicker,
  args: { label: '작업대', name: '알람 분류' },
  parameters: {
    docs: {
      subtitle: '@ap/ui · packages/sdk/ui/src/layout/ToolbarKicker.tsx',
      page: guidedPage(),
    },
  },
} satisfies Meta<typeof ToolbarKicker>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 라벨과 이름. */
export const Default: Story = {};
