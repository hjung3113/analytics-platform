import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@ap/ui';
import { guidedPage } from '../guidance';

/** 화면 가장자리에서 밀려 나오는 모달 판(`side`: top·right·bottom·left). 기록 상세는 DetailDrawer가 맡는다. */
const meta = {
  title: '떠 있는 표면/Sheet',
  component: Sheet,
  args: { open: true },
  parameters: {
    docs: {
      story: { inline: false, iframeHeight: 360 },
      subtitle: '@ap/ui · packages/sdk/ui/src/components/shadcn/sheet.tsx',
      page: guidedPage(
        [['docs/contract/components.md', 'Shadow는 Popover/Dropdown/Drawer/Modal 같은']],
      ),
    },
  },
  render: args => <Sheet {...args}>
    <SheetContent closeLabel="닫기">
      <SheetHeader>
        <SheetTitle>알람 기준</SheetTitle>
        <SheetDescription>증착 설비의 진공 알람 임계값을 확인합니다.</SheetDescription>
      </SheetHeader>
      <p className="my-4 text-sm">챔버 압력 5분 평균이 기준의 120%를 넘으면 진공 알람으로 셉니다.</p>
      <SheetFooter><SheetClose asChild><Button variant="secondary">닫기</Button></SheetClose></SheetFooter>
    </SheetContent>
  </Sheet>,
} satisfies Meta<typeof Sheet>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 오른쪽 판(기본). */
export const Right: Story = {};
