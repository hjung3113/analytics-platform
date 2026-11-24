import type { Meta, StoryObj } from '@storybook/react-vite';
import { ViewManagement } from '@ap/components';
import { guidedPage } from '../guidance';
import { decide, groupName, ME, personName, REQUESTS, VIEWS } from './views';

/** 요청할 때만 여는 «뷰 관리» 표면: 소유자·저장 내용·승인 큐·낡음/권한 설명. 승인 대기는 필터로 바로 연다. */
const meta = {
  title: '저장된 뷰/ViewManagement',
  component: ViewManagement,
  args: {
    open: true, onOpenChange: () => undefined, entries: VIEWS, requests: REQUESTS, currentUserId: ME, personName, groupName,
    diagnoses: { 'v-dep': { status: 'stale', reasons: ['지표 «알람 건수»의 정의가 바뀌었습니다'] } }, onDecide: decide, onRevoke: decide,
  },
  argTypes: { entries: { control: false }, requests: { control: false }, diagnoses: { control: false }, onDecide: { control: false }, onRevoke: { control: false } },
  parameters: { docs: {
    subtitle: '@ap/components · packages/sdk/components/src/saved-view/ViewManagement.tsx',
    page: guidedPage(
      [['docs/contract/kernel.md', '승인 대기는 이 표면의 필터로 직접 연다']],
      [['docs/contract/kernel.md', '일상 조회 중 자동으로 열거나 본문 폭을 고정 점유하지 않는다']],
    ),
    story: { inline: false, iframeHeight: 640 },
  } },
} satisfies Meta<typeof ViewManagement>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 전체: 읽을 수 있는 뷰와 열 수 없는 뷰, 낡은 뷰 설명. */
export const All: Story = {};
/** `initialFilter="pending"`: 승인 큐로 바로 연다. */
export const Pending: Story = { args: { initialFilter: 'pending' } };
