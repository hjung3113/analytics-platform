import type { Meta, StoryObj } from '@storybook/react-vite';
import { KeyboardShortcut } from '@ap/ui';
import { guidedPage } from '../guidance';

/** 탐색과 명령 팔레트가 함께 쓰는 작은 키 힌트. 조작을 붙이지 않는 표시 전용이다. */
const meta = {
  title: '표시/KeyboardShortcut',
  component: KeyboardShortcut,
  args: { children: '⌘K' },
  parameters: {
    docs: {
      subtitle: '@ap/ui · packages/sdk/ui/src/components/KeyboardShortcut.tsx',
      page: guidedPage(),
    },
  },
} satisfies Meta<typeof KeyboardShortcut>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 키 하나. */
export const Default: Story = {};

/** 메뉴 항목 끝에 붙인 힌트. */
export const InMenuRow: Story = {
  render: args => <div className="flex w-64 items-center justify-between rounded-md border border-border-subtle px-3 py-2 text-sm">
    명령 팔레트 열기 <KeyboardShortcut {...args} />
  </div>,
};
