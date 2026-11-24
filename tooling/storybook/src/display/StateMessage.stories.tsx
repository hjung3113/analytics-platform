import type { Meta, StoryObj } from '@storybook/react-vite';
import { AlertTriangle, Inbox, Lock } from 'lucide-react';
import { StateMessage } from '@ap/components';
import { Button } from '@ap/ui';
import { guidedPage } from '../guidance';

/** 조회 결과가 값이 아닐 때(0건·권한 없음·오류) 이유와 다음 동작을 알린다. 표와 차트의 상태 칸이 쓰는 공유 부품. */
const meta = {
  title: '표시/StateMessage',
  component: StateMessage,
  args: { icon: <Inbox className="size-4" aria-hidden />, title: '조건에 맞는 설비가 없습니다', body: '기간을 넓히거나 공정 조건을 바꿔 보세요.' },
  decorators: [Story => <div className="w-[480px]"><Story /></div>],
  parameters: {
    docs: {
      subtitle: '@ap/components · packages/sdk/components/src/StateView.tsx',
      page: guidedPage(
        [['docs/contract/components.md', '성공한 조회가 0건이라는 사실만 확인되면'], ['docs/contract/components.md', '띠 또는 카드마다 원인을 해결하는 주 동작을 하나까지 둔다']],
        [['docs/contract/components.md', '`No Data` 하나로 합치지 않는다'], ['docs/contract/components.md', 'UI가 행 수만으로 원인을 추론하지 않는다']],
      ),
    },
  },
} satisfies Meta<typeof StateMessage>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 0건(neutral): 결과는 받았지만 조건에 맞는 행이 없다. */
export const NoResult: Story = {};

/** 권한 없음(warning). */
export const Forbidden: Story = { args: { tone: 'warning', icon: <Lock className="size-4" aria-hidden />, title: '이 공정을 볼 권한이 없습니다', body: '관리자에게 식각 공정 조회 권한을 요청하세요.' } };

/** 서버 오류(danger): 재시도 동작과 접힌 기술 정보. */
export const ServerError: Story = {
  args: { tone: 'danger', icon: <AlertTriangle className="size-4" aria-hidden />, title: '설비 목록을 불러오지 못했습니다', body: '잠시 뒤 다시 시도하세요.',
    action: <Button size="sm" variant="secondary">다시 시도</Button>, correlationId: 'req-7f3a2c', detail: 'upstream timeout after 30s' },
};
