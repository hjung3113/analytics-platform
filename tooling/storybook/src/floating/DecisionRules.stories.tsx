import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import { Button, DecisionImpactConfirmDialog, DecisionReasonField, UndoToast, createDecisionUndoToastAction, requiredDecisionReasonError } from '@ap/ui';
import { guidedPage } from '../guidance';

/**
 * 동작마다 의사결정 종류를 골라 붙이는 조각(선택 적용). 되돌릴 수 있음은 «실행 취소» 토스트(`createDecisionUndoToastAction`),
 * 판단 기록은 필수 한 줄 사유(`DecisionReasonField`), 되돌릴 수 없음은 영향 한 문장 확인(`DecisionImpactConfirmDialog`).
 */
const meta = {
  title: '떠 있는 표면/의사결정 규칙',
  component: DecisionReasonField,
  args: { kind: 'judgment', value: '센서 교체 후 재측정 값이 정상 범위', onChange: () => {}, maxLength: 80 },
  render: function Render(args) {
    const [value, setValue] = useState(args.value);
    return <div className="w-[420px]"><DecisionReasonField {...args} value={value} onChange={setValue} /></div>;
  },
  parameters: {
    docs: {
      subtitle: '@ap/ui · packages/sdk/ui/src/decision-rules/DecisionRules.tsx',
      page: guidedPage([
        ['docs/contract/components.md', '소비자는 동작별로 의사결정 종류를 명시해 적용한다'],
        ['docs/contract/components.md', '결정과 함께 필수 한 줄 사유를 기록한다'],
        ['docs/contract/components.md', '확인 뒤에만 명령을 보내며'],
      ]),
    },
  },
} satisfies Meta<typeof DecisionReasonField>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 판단 기록: «· 필수» 표식이 붙은 한 줄 사유. */
export const Judgment: Story = {};

/** 판단 기록, 빈 사유로 제출한 뒤: `requiredDecisionReasonError`의 오류가 입력 아래에 남는다. */
export const JudgmentError: Story = { args: { value: '', error: requiredDecisionReasonError('') } };

/** 되돌릴 수 있음: 즉시 실행하고 «실행 취소» 토스트를 준다(호스트 토스트에 넘길 동작은 `createDecisionUndoToastAction`). */
export const Reversible: Story = {
  render: () => {
    const action = createDecisionUndoToastAction({ kind: 'reversible', onUndo: () => {} });
    return <UndoToast message="EQ-0207 알람 9건을 «조치 불필요»로 바꿨습니다" actionLabel={action.label} onAction={action.onAction} duration={0} />;
  },
};

/** 되돌릴 수 없음: 트리거를 누르면 영향 한 문장과 취소·확인이 뜬다(문서에서는 눌러 둔 상태). */
export const Irreversible: Story = {
  render: () => <DecisionImpactConfirmDialog kind="irreversible" onConfirm={() => {}}
    trigger={<Button variant="destructive" size="toolbar">권한 취소</Button>}
    impactText="홍길동의 식각 2라인 설비 편집 권한을 지금 취소하며, 진행 중인 편집은 저장되지 않습니다." />,
  play: async ({ canvasElement }) => { await userEvent.click(within(canvasElement).getByRole('button', { name: '권한 취소' })); },
  parameters: { docs: { story: { inline: false, iframeHeight: 300, autoplay: true } } },
};
