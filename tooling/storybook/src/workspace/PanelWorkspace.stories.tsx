import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { PanelAddMenu, PanelWorkspace, type PanelWorkspaceProps } from '@ap/components';
import { guidedPage } from '../guidance';
import { ADD_ITEMS } from './panels';
import { PANELS, PRESETS, workspacePage } from './workspace';

/** 밀집 분석 메뉴의 패널 작업 영역. 메뉴가 패널·프리셋·기본 패널을 선언하고 탭·끌기·나누기·최대화·숨긴 패널·기본 배치·로컬 선호는 플랫폼이 맡는다. */
const meta = {
  title: '페이지·작업 영역/PanelWorkspace',
  component: PanelWorkspace,
  args: { panels: PANELS(), presets: PRESETS, initialPreset: 'balanced', persistKey: 'storybook', label: { ko: '설비 분석', en: 'Equipment analysis' }, initialMode: 'fit' },
  argTypes: { panels: { control: false }, presets: { control: false }, toolbarActions: { control: false } },
  decorators: [Story => <div className="flex h-[520px] w-full flex-col"><Story /></div>, workspacePage],
  parameters: { docs: {
    subtitle: '@ap/components · packages/sdk/components/src/workspace/PanelWorkspace.tsx',
    page: guidedPage([['docs/contract/layout.md', '패널이 4개 이상인 밀집 분석 메뉴가 쓰는 선택 레이아웃이다'], ['docs/contract/layout.md', '그 밖의 메뉴는 `AnalysisLayout`(§12.6)을 그대로 쓴다']]),
  } },
} satisfies Meta<typeof PanelWorkspace>;
export default meta;
type Story = StoryObj<typeof meta>;

/** `balanced` 프리셋: 기본 패널(가동률) 옆에 알람·사이클타임 탭 묶음. */
export const Balanced: Story = {};
/** `focus` 프리셋: 세 패널이 한 탭 묶음. */
export const Focus: Story = { args: { initialPreset: 'focus', persistKey: 'storybook.focus' } };
/** `toolbarActions`: 메뉴의 작업 영역 동작(여기서는 `PanelAddMenu`)을 도구줄 끝에 둔다. */
export const WithAddMenu: Story = { args: { persistKey: 'storybook.add', toolbarActions: <PanelAddMenu items={ADD_ITEMS} shown={['alarms']} onAdd={() => undefined} /> } };
/** `panelAddDrag`: «패널 추가» 목록 줄을 작업 영역으로 끌면 놓을 자리를 미리 보이고, 놓으면 누를 때와 같은 `onAdd`로 더한 뒤 그 자리로 옮긴다. */
const trendCategory = { id: 'trend', title: { ko: '추세', en: 'Trends' } };
const breakdownCategory = { id: 'breakdown', title: { ko: '분해', en: 'Breakdowns' } };
/** The same items in the categorized picker (#2744), so the capture shows the faded preview pane while dragging. */
const DRAG_ITEMS = ADD_ITEMS.map(item => ({ ...item, ...(item.id === 'trend' || item.id === 'downtime'
  ? { category: trendCategory, kind: 'line' as const } : { category: breakdownCategory, kind: 'bar' as const }) }));
function AddDragWorkspace(args: PanelWorkspaceProps) {
  const [panels, setPanels] = useState(() => PANELS().filter(panel => panel.id !== 'cycle'));
  const add = (id: string) => { const item = DRAG_ITEMS.find(entry => entry.id === id); if (item) setPanels(list => [...list, { id, title: item.title, render: () => <p className="p-3 text-sm">{item.title.ko}</p> }]); };
  return <PanelWorkspace {...args} panels={panels} panelAddDrag toolbarActions={<PanelAddMenu items={DRAG_ITEMS} shown={panels.map(panel => panel.id)} onAdd={add} />} />;
}
export const WithAddDrag: Story = { args: { persistKey: 'storybook.add-drag' }, render: args => <AddDragWorkspace {...args} /> };
