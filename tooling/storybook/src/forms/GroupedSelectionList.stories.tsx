import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { GroupedSelectionList, type GroupedSelectionGroup, type GroupedSelectionListProps } from '@ap/ui';
import { EQUIPMENT, PROCESSES } from '../equipment';
import { guidedPage } from '../guidance';

const GROUPS: GroupedSelectionGroup[] = PROCESSES.map(p => ({ id: p, label: p, items: EQUIPMENT.filter(e => e.process === p).map(e => ({
  id: e.id, label: e.id, description: `가동률 ${e.util.toFixed(1)}% · 사이클타임 ${e.cycle}초`,
  ...(e.alarms >= 5 ? { badge: { label: `알람 ${e.alarms}`, tone: 'warning' as const } } : {}),
  ...(e.id === 'EQ-0315' ? { disabledReason: '정기 보전 중이라 이번 점검에 넣을 수 없음' } : {}),
})) }));
const PRESETS = [{ id: 'alarm', label: '알람 많은 설비', description: '최근 7일 알람 5건 이상', itemIds: ['EQ-0207', 'EQ-0519'] }];

function Controlled(props: Partial<GroupedSelectionListProps>) {
  const [many, setMany] = useState<string[]>(['EQ-0142']);
  const [one, setOne] = useState<string | null>('EQ-0142');
  const common = { groups: GROUPS, 'aria-label': '점검 대상 설비', searchPlaceholder: '설비·공정 검색' };
  return <div className="w-[420px] rounded-md border border-border-subtle p-3">{props.mode === 'single'
    ? <GroupedSelectionList {...common} {...props} mode="single" value={one} onChange={setOne} />
    : <GroupedSelectionList {...common} presets={PRESETS} {...props} mode="multiple" value={many} onChange={setMany} />}</div>;
}

/** 공정별로 묶은 제어형 선택 목록. 검색, 그룹 전체 선택, 다중 선택 프리셋, 비활성 이유, 배지를 한 조각이 그린다. 문구는 `messages`로 받는다. */
const meta: Meta<typeof GroupedSelectionList> = {
  title: '폼/GroupedSelectionList',
  component: GroupedSelectionList,
  render: () => <Controlled />,
  parameters: {
    docs: {
      subtitle: '@ap/ui · packages/sdk/ui/src/forms/GroupedSelectionList.tsx',
      page: guidedPage([
        ['docs/contract/components.md', '각 id는 목록 전체에서 유일해야 한다'],
        ['docs/contract/components.md', '검색과 프리셋 머리는 소비자가 소유한 한 스크롤 층 안에서 sticky다'],
        ['docs/contract/components.md', '비활성 항목은 설명 아래 이유를 표시하고'],
      ]),
    },
  },
};
export default meta;
type Story = StoryObj;

/** 다중 선택(`mode="multiple"`): 그룹 3상태 선택과 프리셋. */
export const Multiple: Story = {};

/** 단일 선택(`mode="single"`): 라디오 행, 프리셋·그룹 선택 없음. */
export const Single: Story = { render: () => <Controlled mode="single" /> };

/** 표시 옵션: 한 줄 행(`density="compact"`), 칩 요약, 프리셋 미리보기, 비활성 접기. */
export const Compact: Story = { render: () => <Controlled density="compact" selectionSummary="chips" presetPreview hideDisabled
  messages={{ hiddenItems: n => `정기 보전 중이라 넣을 수 없는 설비 ${n}대` }} /> };
