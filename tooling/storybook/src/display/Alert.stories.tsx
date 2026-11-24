import type { Meta, StoryObj } from '@storybook/react-vite';
import { CircleAlert, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@ap/ui';
import { guidedPage } from '../guidance';

/** 영역 안에 머무는 알림 상자(`role="alert"`). 제목 `AlertTitle`과 설명 `AlertDescription`, 앞에 아이콘을 둘 수 있다. */
const meta = {
  title: '표시/Alert',
  component: Alert,
  args: { variant: 'default' },
  render: args => <Alert {...args}>
    <Info className="size-4" aria-hidden />
    <AlertTitle>집계 지연</AlertTitle>
    <AlertDescription>EQ-0207 로그가 06:00 이후 들어오지 않아 오늘 가동률은 잠정 값입니다.</AlertDescription>
  </Alert>,
  decorators: [Story => <div className="w-[560px]"><Story /></div>],
  parameters: {
    docs: {
      subtitle: '@ap/ui · packages/sdk/ui/src/components/shadcn/alert.tsx',
      page: guidedPage(),
    },
  },
} satisfies Meta<typeof Alert>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 기본: 알림 내용. */
export const Default: Story = {};

/** 실패(`variant="destructive"`). */
export const Destructive: Story = {
  args: { variant: 'destructive' },
  render: args => <Alert {...args}>
    <CircleAlert className="size-4" aria-hidden />
    <AlertTitle>저장하지 못했습니다</AlertTitle>
    <AlertDescription>설비 기준정보 서버가 응답하지 않습니다. 잠시 뒤 다시 시도하세요.</AlertDescription>
  </Alert>,
};
