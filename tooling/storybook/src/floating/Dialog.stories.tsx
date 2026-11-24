import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@ap/ui';
import { guidedPage } from '../guidance';

/** 화면을 막고 확인이나 짧은 입력을 받는 모달. 닫으면 연 요소로 포커스가 돌아간다. */
const meta = {
  title: '떠 있는 표면/Dialog',
  component: Dialog,
  args: { open: true },
  parameters: {
    docs: {
      story: { inline: false, iframeHeight: 320 },
      subtitle: '@ap/ui · packages/sdk/ui/src/components/shadcn/dialog.tsx',
      page: guidedPage(
        [['docs/contract/components.md', 'Shadow는 Popover/Dropdown/Drawer/Modal 같은'], ['docs/contract/components.md', 'Escape·닫기 버튼 모두 같다']],
        [['docs/contract/components.md', '화면은 이 동작을 손으로 되풀이하지 않고']],
      ),
    },
  },
  render: args => <Dialog {...args}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>보기 저장</DialogTitle>
        <DialogDescription>식각 공정 · 최근 7일 조건을 «식각 주간 점검»으로 저장합니다.</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <DialogClose asChild><Button variant="secondary">취소</Button></DialogClose>
        <Button>저장</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>,
} satisfies Meta<typeof Dialog>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 열린 확인 대화상자: 제목·설명·취소와 주 동작. */
export const Open: Story = {};
