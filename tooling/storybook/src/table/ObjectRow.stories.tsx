import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { ObjectRow, RowSelectionBar, StatusBadge } from '@ap/ui';
import { EQUIPMENT } from '../equipment';
import { guidedPage } from '../guidance';

const severityOf = (alarms: number) => (alarms >= 9 ? 'critical' : alarms >= 6 ? 'high' : alarms >= 3 ? 'medium' : alarms > 0 ? 'low' : undefined);

/** 표가 아닌 목록의 한 행: ID·제목·메타·오른쪽 값. 선택된 행은 선택 면과 `RowSelectionBar` 막대를 함께 그린다. */
const meta = {
  title: '표 데이터/ObjectRow',
  component: ObjectRow,
  subcomponents: { RowSelectionBar },
  args: { id: 'EQ-0207', title: '증착 설비', meta: '사이클타임 176초 · 알람 9건', severity: 'critical', selected: true, trailing: <span className="tabular text-sm">72.5%</span> },
  argTypes: { trailing: { control: false } },
  decorators: [Story => <div className="w-[560px] rounded-md border border-border-subtle bg-surface-card"><Story /></div>],
  parameters: {
    docs: {
      subtitle: '@ap/ui · packages/sdk/ui/src/data/ObjectRow.tsx · RowSelectionBar.tsx',
      page: guidedPage(
        [['DESIGN.md', '목록 선택은 selected surface와 2px'], ['DESIGN.md', '목록 행은 `data-list-row`']],
        [['DESIGN.md', 'nested 버튼이 있는 행을 통째 clickable wrapper로 만들지 않는다']],
      ),
    },
  },
} satisfies Meta<typeof ObjectRow>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 선택된 행: 선택 면과 왼쪽 2px 막대. */
export const Selected: Story = {};

/** 클릭으로 고르는 목록: 알람 수로 심각도 띠, 상태 배지는 메타 줄. */
export const List: Story = {
  render: function ListStory() {
    const [active, setActive] = useState('EQ-0207');
    return <>{EQUIPMENT.slice(0, 5).map(e => <ObjectRow key={e.id} id={e.id} title={`${e.process} 설비`} selected={e.id === active} onClick={() => setActive(e.id)}
      severity={severityOf(e.alarms)} leadingCell="always" meta={`알람 ${e.alarms}건`} trailing={<span className="tabular text-sm">{e.util.toFixed(1)}%</span>}
      badges={e.util < 80 ? <StatusBadge tone="warning">점검 필요</StatusBadge> : undefined} />)}</>;
  },
};

/** 체크 선택(`selectable`): 여러 행을 고른다. */
export const Selectable: Story = { args: { selectable: true, checked: true, selected: false, severity: undefined } };

/** `RowSelectionBar` 단독: 직접 그린 목록 행(`relative`)에 선택 중일 때만 붙인다. */
export const SelectionBar: Story = {
  render: () => <div data-list-row="" data-selected="" className="relative bg-surface-row-selected px-5 py-2.5 text-sm"><RowSelectionBar />식각 주간 점검(저장된 보기)</div>,
};
