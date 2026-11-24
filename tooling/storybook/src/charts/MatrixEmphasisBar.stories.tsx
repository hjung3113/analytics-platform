import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import type { MatrixEmphasisRule } from '@ap/contracts';
import { MatrixEmphasisBar } from '@ap/components';
import { guidedPage } from '../guidance';

const RULES: MatrixEmphasisRule[] = [{ row: 'EQ-0207', match: { kind: 'range', max: 80 } }, { row: 'EQ-0519', match: { kind: 'values', values: ['정지'] } }];
// Controlled rules and the «이 열만 보기» toggle, as the TreeMatrix consumer holds them.
function Bar({ only = false }: { only?: boolean }) {
  const [rules, setRules] = useState(RULES);
  const [onlyMatching, setOnlyMatching] = useState(only);
  return <MatrixEmphasisBar emphasis={rules} onEmphasisChange={setRules} onlyMatchingColumns={onlyMatching} onOnlyMatchingColumnsChange={setOnlyMatching} rowLabel={row => `${row} 행`} />;
}

/** `TreeMatrix` 위의 행별 강조 칩 줄: 강조 개수, 행별 삭제, 모두 지우기, «이 열만 보기». 규칙이 없으면 그리지 않는다. 강조는 일시 상태다. */
const meta = {
  title: '데이터 시각화/MatrixEmphasisBar',
  component: MatrixEmphasisBar,
  parameters: { docs: { page: guidedPage(
    [['docs/contract/components.md', '`MatrixEmphasisBar`는 강조 개수, 행별 삭제']],
    [['docs/contract/components.md', 'URL·사용자 설정·Saved View에 저장하지 않는다']],
  ) } },
} satisfies Meta<typeof MatrixEmphasisBar>;
export default meta;
type Story = StoryObj;

/** 강조 둘: EQ-0207 행은 80 이하 값, EQ-0519 행은 «정지» 값. 칩 ×로 하나씩 지운다. */
export const Rules: Story = { render: () => <Bar /> };
/** «이 열만 보기»를 켠 상태: 행렬은 규칙이 맞은 열과 고정 열만 남긴다. */
export const OnlyMatching: Story = { render: () => <Bar only /> };
