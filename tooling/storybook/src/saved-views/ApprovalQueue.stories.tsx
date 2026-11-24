import type { Meta, StoryObj } from '@storybook/react-vite';
import { ApprovalQueue } from '@ap/components';
import { guidedPage } from '../guidance';
import { decide, groupName, ME, personName, REQUESTS, VIEWS } from './views';

/** 공식 신청의 승인 큐. 상태 필터(대기·승인·반려·전체)와 신청 내용, 객체별 capability가 허락한 승인·반려·회수만 보인다. */
const meta = {
  title: '저장된 뷰/ApprovalQueue',
  component: ApprovalQueue,
  args: { items: VIEWS, requests: REQUESTS, currentUserId: ME, personName, groupName, onDecide: decide, onRevoke: decide },
  argTypes: { items: { control: false }, requests: { control: false }, onDecide: { control: false }, onRevoke: { control: false } },
  decorators: [Story => <div className="h-[480px] w-[900px]"><Story /></div>],
  parameters: { docs: {
    subtitle: '@ap/components · packages/sdk/components/src/saved-view/ApprovalQueue.tsx',
    page: guidedPage([['docs/contract/kernel.md', '공식 등록본은 개인 편집으로 덮어쓰지 않으며 변경본은 재승인 대상이다']]),
  } },
} satisfies Meta<typeof ApprovalQueue>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 승인 대기: 세정 대기 분석의 변경 두 줄. */
export const Pending: Story = {};
/** 신청 하나를 연 상태(`selectedId`). */
export const Detail: Story = { args: { selectedId: 'v-clean' } };
/** 반려: 내가 신청한 뷰는 반려 사유와 함께 남는다(신청자·승인자에게만 보인다). */
export const Rejected: Story = { args: { defaultStatus: 'rejected', selectedId: 'v-old' } };
