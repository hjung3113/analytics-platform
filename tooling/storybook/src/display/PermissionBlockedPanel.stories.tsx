import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, PermissionBlockedPanel } from '@ap/ui';
import { guidedPage } from '../guidance';

/**
 * 권한이 없어 내용을 보일 수 없을 때의 패널. 기본 `layout="panel"`은 상태별 아이콘·요청 버튼·필요 scope를,
 * `layout="card"`는 가운데 잠금 카드에 필요한 권한과 소비자가 준 요청·이동 버튼을 보인다. 조회·판정·신청은 하지 않는다.
 */
const meta = {
  title: '표시/PermissionBlockedPanel',
  component: PermissionBlockedPanel,
  args: { state: 'request_access', category: '설비 상세', reason: '식각 2라인 설비를 볼 권한이 없습니다.', requiredScope: ['equipment:read:etch-2'], onRequestAccess: () => {} },
  decorators: [Story => <div className="w-[640px]"><Story /></div>],
  parameters: {
    docs: {
      subtitle: '@ap/ui · packages/sdk/ui/src/permissions/PermissionBlockedPanel.tsx',
      page: guidedPage([['docs/contract/components.md', '요청 대상과 제출 자격은 소비자와 서버가 판정한다'], ['docs/contract/components.md', '페이지 게이트는 `headingLevel={2}`와 `announceBody`를 쓰며']]),
    },
  },
} satisfies Meta<typeof PermissionBlockedPanel>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 패널, 요청할 수 있음. */
export const RequestAccess: Story = {};

/** 패널, 요청할 수 없음. */
export const NotRequestable: Story = { args: { state: 'blocked_not_requestable' } };

/** 카드(`layout="card"`), 요청 전: «권한 요청»과 «홈으로». */
export const Card: Story = {
  args: { layout: 'card', headingLevel: 2, announceBody: true, missing: { permission: '설비 조회(식각 2라인)', system: '설비 관리' }, requestStatus: 'none',
    requestAction: <Button size="toolbar">권한 요청</Button>, exitAction: <Button size="toolbar" variant="secondary">홈으로</Button> },
};

/** 카드, 검토 중: 본문이 상태로 알린다. */
export const CardPending: Story = { args: { ...Card.args, requestStatus: 'pending', requestAction: <Button size="toolbar" variant="secondary">내 권한 요청 보기</Button> } };
