import type { Meta, StoryObj } from '@storybook/react-vite';
import { GroupEditor } from '@ap/components';
import { guidedPage } from '../guidance';
import { GROUP, ME, ok, PEOPLE, searchPeople } from './views';

/** 공유 그룹 만들기·고치기 대화창(이름, 사람 추가·빼기). 그룹은 서버에 바로 생기고, 뷰 공유는 여기서 정하지 않는다. */
const meta = {
  title: '저장된 뷰/GroupEditor',
  component: GroupEditor,
  args: {
    open: true, onOpenChange: () => undefined, currentUserId: ME, searchPeople, initialMembers: PEOPLE.slice(1, 3),
    onCreate: () => ok(GROUP), onUpdate: () => ok(GROUP), onDone: () => undefined,
  },
  argTypes: { entry: { control: false }, initialMembers: { control: false }, searchPeople: { control: false } },
  parameters: { docs: {
    subtitle: '@ap/components · packages/sdk/components/src/saved-view/GroupEditor.tsx',
    page: guidedPage([['docs/contract/kernel.md', '이미 생성한 그룹은 취소해도 남는다']]),
    story: { inline: false, iframeHeight: 600 },
  } },
} satisfies Meta<typeof GroupEditor>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 만들기: 사람 지정 목록에서 넘어온 두 사람으로 시작한다. */
export const Create: Story = {};
/** 고치기(`entry`): 이름 바꾸기와 구성원 추가·빼기. */
export const Edit: Story = { args: { entry: GROUP, initialMembers: undefined } };
