import type { Meta, StoryObj } from '@storybook/react-vite';
import { DirtyConfirmation } from '@ap/ui';
import { guidedPage } from '../guidance';

/** 저장하지 않은 입력을 두고 떠나려 할 때 묻는 확인. 확인 버튼은 파괴적 모양이고, Escape는 `onCancel`로 온다. */
const meta = {
  title: '떠 있는 표면/DirtyConfirmation',
  component: DirtyConfirmation,
  args: { open: true, onConfirm: () => {}, onCancel: () => {} },
  parameters: {
    docs: {
      story: { inline: false, iframeHeight: 280 },
      subtitle: '@ap/ui · packages/sdk/ui/src/feedback/DirtyConfirmation.tsx',
      page: guidedPage(),
    },
  },
} satisfies Meta<typeof DirtyConfirmation>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 기본 문구. */
export const Default: Story = {};

/** 메뉴 문구로 바꾼 확인. */
export const CustomCopy: Story = {
  args: { title: '설비 메모를 저장하지 않았습니다', message: 'EQ-0207 메모 3줄이 사라집니다.', confirmLabel: '버리고 닫기', cancelLabel: '계속 작성' },
};
