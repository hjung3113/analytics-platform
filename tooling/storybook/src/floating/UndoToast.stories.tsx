import type { Meta, StoryObj } from '@storybook/react-vite';
import { UndoToast } from '@ap/ui';
import { guidedPage } from '../guidance';

/**
 * 방금 한 동작을 되돌리는 토스트 본체. 위치는 호스트 토스트(`toast.custom`)가 정하고, 자동 닫힘 타이머는 이 조각만 가지며
 * 포커스·포인터가 안에 있으면 멈춘다. 문서에서는 `duration={0}`으로 타이머를 끈다.
 */
const meta = {
  title: '떠 있는 표면/UndoToast',
  component: UndoToast,
  args: { message: 'EQ-0315를 점검 목록에서 뺐습니다', onAction: () => {}, duration: 0 },
  parameters: {
    docs: {
      subtitle: '@ap/ui · packages/sdk/ui/src/feedback/UndoToast.tsx',
      page: guidedPage([['docs/contract/components.md', '«실행 취소» 토스트를 제공하고']]),
    },
  },
} satisfies Meta<typeof UndoToast>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 기본 «실행 취소». */
export const Default: Story = {};

/** 메뉴 문구로 바꾼 동작 이름. */
export const CustomAction: Story = { args: { message: '알람 3건을 확인 처리했습니다', actionLabel: '되돌리기' } };
