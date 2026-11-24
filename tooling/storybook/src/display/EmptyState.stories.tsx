import type { Meta, StoryObj } from '@storybook/react-vite';
import { Inbox } from 'lucide-react';
import { Button, EmptyState } from '@ap/ui';
import { guidedPage } from '../guidance';

/** 아이콘·제목·설명·동작을 가운데 모은 빈 자리 표시. 조회 응답의 상태는 StateMessage가 맡는다. */
const meta = {
  title: '표시/EmptyState',
  component: EmptyState,
  args: { icon: <Inbox className="size-6" />, title: '비교할 설비를 고르세요', body: '목록에서 설비를 두 대 이상 선택하면 여기에 비교 차트가 나옵니다.' },
  argTypes: { icon: { control: false } },
  decorators: [Story => <div className="w-[480px] rounded-md border border-border-subtle"><Story /></div>],
  parameters: {
    docs: {
      subtitle: '@ap/ui · packages/sdk/ui/src/feedback/EmptyState.tsx',
      page: guidedPage(),
    },
  },
} satisfies Meta<typeof EmptyState>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 기본 크기(md). */
export const Default: Story = {};

/** 동작이 있는 빈 자리. */
export const WithAction: Story = { args: { action: <Button size="sm" variant="secondary">설비 선택</Button> } };

/** 좁은 칸용 작은 크기(sm). */
export const Small: Story = { args: { size: 'sm', icon: undefined, body: undefined } };
