import type { Meta, StoryObj } from '@storybook/react-vite';
import { ShareTargetPicker } from '@ap/components';
import { guidedPage } from '../guidance';
import { GROUP, ME, ok, PEOPLE, searchPeople } from './views';

/** 뷰의 공유 대상(나만·사람 지정·그룹·공식 신청)을 고르는 대화창. 그룹을 만들거나 고쳐도 공유는 «공유 대상 저장»에서만 확정된다. */
const meta = {
  title: '저장된 뷰/ShareTargetPicker',
  component: ShareTargetPicker,
  args: {
    open: true, onOpenChange: () => undefined, value: { mode: 'people', people: PEOPLE.slice(1, 3), groupIds: [] },
    groups: { status: 'ready', entries: [GROUP], retry: () => undefined }, currentUserId: ME, searchPeople,
    onCreateGroup: () => ok(GROUP), onUpdateGroup: () => ok(GROUP), onConfirm: () => true,
  },
  argTypes: { value: { control: false }, groups: { control: false }, searchPeople: { control: false } },
  parameters: { docs: {
    subtitle: '@ap/components · packages/sdk/components/src/saved-view/ShareTargetPicker.tsx',
    page: guidedPage(
      [['docs/contract/kernel.md', '뷰의 공개 대상은 `공유 대상 저장` 또는 새 뷰의 최종 `저장`에서만 확정된다']],
      [['docs/contract/kernel.md', '공유는 권한을 주지 않는다']],
    ),
    story: { inline: false, iframeHeight: 640 },
  } },
} satisfies Meta<typeof ShareTargetPicker>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 사람 지정: 두 사람을 고른 상태. */
export const People: Story = {};
/** 그룹: 공유 그룹 하나를 고른 상태. */
export const Groups: Story = { args: { value: { mode: 'groups', people: [], groupIds: [GROUP.group.id] } } };
/** 확정이 거절된 경우: 대화창과 고른 값이 남고 이유를 보인다. */
export const ConfirmError: Story = { args: { confirmError: '다른 곳에서 바뀌었습니다. 목록을 다시 읽었으니 확인 후 다시 저장하세요.' } };
