import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { LegendTree, type LegendTreeProps } from '@ap/components';
import { LEGEND } from '../equipment';
import { guidedPage } from '../guidance';

// Controlled visibility (and drill step) as a menu holds it.
function Tree(props: Partial<LegendTreeProps>) {
  const [visible, setVisible] = useState<ReadonlySet<string>>(new Set(['EQ-0142', 'EQ-0408', 'EQ-0207', 'EQ-0412', 'EQ-0617']));
  const [current, setCurrent] = useState('식각');
  return <div className="w-72 rounded-md border border-border-subtle bg-surface-card p-2"><LegendTree nodes={LEGEND} label="공정·설비 범례" visible={visible} onVisibleChange={setVisible}
    defaultExpanded={new Set(['식각', '증착'])} {...props} {...(props.onDrill ? { currentId: current, onDrill: setCurrent } : {})} /></div>;
}

/** 계층 범례: 체크로 시리즈를 보이고 숨기며, 드릴을 주면 행이 단계 이동이 된다(ADR-0057·0084). 보이기와 현재 단계는 메뉴가 제어한다. */
const meta = {
  title: '데이터 시각화/LegendTree',
  component: LegendTree,
  parameters: { docs: { page: guidedPage(
    [['docs/contract/chart.md', '`hint`는 트리 머리에 사용법 한 줄'], ['docs/contract/chart.md', '드릴은 보이기를 바꾸지 않는다']],
  ) } },
} satisfies Meta<typeof LegendTree>;
export default meta;
type Story = StoryObj;

/** 보이기: 공정 → 설비 두 단계, 세정 설비는 모두 꺼져 있고 식각은 일부만 켜져 가지 체크가 «일부»다. */
export const Visibility: Story = { render: () => <Tree /> };
/** 드릴(`onDrill`·`drillOnName`): 이름 클릭은 그 단계로 이동, 체크는 보이기. 현재 단계(식각)에 `현재` 표시, 머리에 사용법 한 줄. */
export const Drill: Story = { render: () => <Tree onDrill={() => {}} drillOnName currentLabel="현재" hint="이름: 단계 이동 · 체크: 포함/제외" /> };
