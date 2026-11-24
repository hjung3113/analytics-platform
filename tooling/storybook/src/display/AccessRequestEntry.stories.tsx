import type { Meta, StoryObj } from '@storybook/react-vite';
import type { AccessRequestSlot } from '@ap/kernel';
import { AccessRequestEntry } from '@ap/components';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@ap/ui';
import { guidedPage } from '../guidance';

// The app injects this slot (server read of the request state + the request dialog); here a fixed state and a plain dialog.
const slot = (pending: boolean): AccessRequestSlot => ({
  Pending: ({ children }) => <>{children({ pending, statusHref: pending ? '#request-status' : null })}</>,
  Dialog: ({ open, onOpenChange }) => <Dialog open={open} onOpenChange={onOpenChange}><DialogContent>
    <DialogTitle>권한 요청</DialogTitle><DialogDescription>1공장 식각 공정 조회 권한을 요청합니다.</DialogDescription>
  </DialogContent></Dialog>,
});

/** 막힌 자리의 «권한 요청» 진입점. 요청이 처리 전이면 «요청 대기 중» 배지와 «요청 상태» 링크를 보인다. 대화창은 그 자리에서 열리고 URL·Context를 바꾸지 않는다. */
const meta = {
  title: '표시/AccessRequestEntry',
  component: AccessRequestEntry,
  args: { slot: slot(false), target: { kind: 'site', site: '1공장' } },
  argTypes: { slot: { control: false } },
  parameters: { docs: {
    subtitle: '@ap/components · packages/sdk/components/src/state/AccessRequestEntry.tsx',
    page: guidedPage(),
  } },
} satisfies Meta<typeof AccessRequestEntry>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 요청 전: «권한 요청» 버튼. */
export const Request: Story = {};
/** `emphasis="primary"`: 신청 동작을 기본 버튼으로 강조한다. */
export const Primary: Story = { args: { emphasis: 'primary' } };
/** 처리 전: «요청 대기 중» 배지와 «요청 상태» 링크. */
export const Pending: Story = { args: { slot: slot(true) } };
