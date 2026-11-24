import type { Meta, StoryObj } from '@storybook/react-vite';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@ap/ui';
import { guidedPage } from '../guidance';

/** 되돌릴 수 없는 동작 앞에서 확인을 받는 모달(`alertdialog`). 바깥 클릭으로 닫히지 않고 취소나 확인을 고른다. */
const meta = {
  title: '떠 있는 표면/AlertDialog',
  component: AlertDialog,
  args: { open: true },
  parameters: {
    docs: {
      story: { inline: false, iframeHeight: 300 },
      subtitle: '@ap/ui · packages/sdk/ui/src/components/shadcn/alert-dialog.tsx',
      page: guidedPage(
        [['docs/contract/components.md', '실행 전에 확인한다'], ['docs/contract/components.md', '한 문장에 영향을 받는 대상·범위·잃게 되는 기능을 쓴다']],
        [['docs/contract/components.md', '화면은 이 동작을 손으로 되풀이하지 않고']],
      ),
    },
  },
  render: args => <AlertDialog {...args}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>설비를 폐기 처리할까요?</AlertDialogTitle>
        <AlertDialogDescription>EQ-0315는 목록·조회 조건에서 빠지고, 남은 알람 기록은 더 이상 이 설비로 묶이지 않습니다.</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>취소</AlertDialogCancel>
        <AlertDialogAction>폐기</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>,
} satisfies Meta<typeof AlertDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 열린 확인: 영향 한 문장, 취소와 확인. */
export const Open: Story = {};
