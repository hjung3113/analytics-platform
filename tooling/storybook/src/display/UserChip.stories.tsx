import type { Meta, StoryObj } from '@storybook/react-vite';
import { Avatar, AvatarFallback, UserAvatar, UserChip } from '@ap/ui';
import { guidedPage } from '../guidance';

const USER = { display_name: '홍길동' };

/**
 * 사람 표시: `UserChip`은 머리글자 아바타(`UserAvatar`)와 이름, 선택 보조 줄을 묶는다. 사용자가 없으면 «알 수 없는 사용자»를 보인다.
 * `UserAvatar`는 이름 첫 글자 원이고, 그 밑의 `Avatar`·`AvatarFallback`은 다른 모양이 필요할 때 쓰는 원형이다.
 */
const meta = {
  title: '표시/UserChip',
  component: UserChip,
  args: { user: USER, sub: '설비 담당' },
  parameters: {
    docs: {
      subtitle: '@ap/ui · packages/sdk/ui/src/identity/UserChip.tsx · UserAvatar.tsx · components/shadcn/avatar.tsx',
      page: guidedPage(),
    },
  },
} satisfies Meta<typeof UserChip>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 이름과 보조 줄. */
export const Default: Story = {};

/** 작은 크기(`size="sm"`), 보조 줄 없음. */
export const Small: Story = { args: { size: 'sm', sub: undefined } };

/** 사용자 정보가 없을 때(탈퇴·권한 밖). */
export const Unknown: Story = { args: { user: null } };

/** `UserAvatar` 세 크기와 `Avatar` 원형(40px). */
export const Avatars: Story = {
  render: () => <div className="flex items-center gap-3">
    {(['sm', 'md', 'lg'] as const).map(size => <UserAvatar key={size} user={{ display_name: '이서연' }} size={size} />)}
    <Avatar><AvatarFallback>EQ</AvatarFallback></Avatar>
  </div>,
};
