import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { PageFilterBar, type PageFilterBarProps } from '@ap/components';
import { Button } from '@ap/ui';
import { PROCESSES } from '../equipment';
import { guidedPage } from '../guidance';

/** Draft state of the page: the bar only shows it, the page's 조회 button applies it. */
function Bar(props: Partial<PageFilterBarProps>) {
  const [search, setSearch] = useState('EQ-02');
  const [process, setProcess] = useState('증착');
  return <PageFilterBar collapsible label="조회 조건" preferenceKey={`storybook:filter:${props.defaultCollapsed ? 'folded' : 'open'}`}
    fields={[
      { key: 'q', kind: 'search', label: '설비 검색', value: search, onValueChange: setSearch, placeholder: '설비 ID' },
      { key: 'process', kind: 'select', label: '공정', value: process, onValueChange: setProcess, options: PROCESSES.map(p => ({ value: p, label: p })), emptyOptionLabel: '전체' },
    ]}
    summaryItems={[{ key: 'q', label: '설비', value: search || '전체' }, { key: 'process', label: '공정', value: process || '전체' }]}
    actions={<Button size="sm">조회</Button>} collapsedActions={<Button size="sm">조회</Button>} {...props} />;
}

/** 페이지 조건의 초안 막대. 라벨 있는 검색·선택·맞춤 필드를 한 줄에 두고, 접으면 모든 조건을 한 줄 요약으로 보인다. 적용은 소비 화면의 버튼이 맡는다. */
const meta = {
  title: '조회·필터/PageFilterBar',
  component: PageFilterBar,
  decorators: [Story => <div className="w-[900px]"><Story /></div>],
  parameters: { docs: {
    subtitle: '@ap/components · packages/sdk/components/src/filters/PageFilterBar.tsx',
    page: guidedPage([['docs/contract/components.md', '막대는 초안(draft) 표시 전용이고'], ['DESIGN.md', '보이는 label을 각 control 위에 둔다']]),
  } },
  render: () => <Bar />,
} satisfies Meta<typeof PageFilterBar>;
export default meta;
type Story = StoryObj;

/** 펼친 막대. */
export const Expanded: Story = {};
/** 접은 막대: 조건 요약 한 줄과 조회 버튼만 남는다. */
export const Collapsed: Story = { render: () => <Bar defaultCollapsed /> };
/** 적용하지 않은 변경이 있다는 표시와 적용된 조건 칩. */
export const PendingWithChips: Story = { render: () => <Bar hasPendingChanges appliedChips={[{ key: 'process', label: '공정', value: '식각', onClear: () => undefined }]} /> };
