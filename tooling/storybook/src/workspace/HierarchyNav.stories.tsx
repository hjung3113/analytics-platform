import type { Meta, StoryObj } from '@storybook/react-vite';
import { Cpu, Factory, Layers } from 'lucide-react';
import { HierarchyNav } from '@ap/components';
import { TooltipProvider } from '@ap/ui';
import { SOURCE } from '../conditions/pageConditions';
import { guidedPage } from '../guidance';
import { withPlatform } from '../platform';

const ICONS = { fab: Factory, process: Layers, equipment: Cpu } as const;

/** 메뉴가 준 `HierarchySource`(공장 › 공정 › 설비)를 지연 로딩·가상화하는 사이드바 데이터 탐색. 탐색 상태는 저장소·URL에 쓰지 않는다. */
const meta = {
  title: '페이지·작업 영역/HierarchyNav',
  component: HierarchyNav,
  args: { menuId: 'storybook', label: '라인 계층', source: SOURCE, levelIcon: kind => ICONS[kind as keyof typeof ICONS] },
  argTypes: { source: { control: false }, state: { control: false }, levelIcon: { control: false } },
  decorators: [Story => <TooltipProvider><div className="h-[400px] w-60 border border-border-subtle bg-surface-card"><Story /></div></TooltipProvider>, withPlatform],
  parameters: { docs: {
    subtitle: '@ap/components · packages/sdk/components/src/hierarchy/HierarchyNav.tsx',
    page: guidedPage([['docs/contract/components.md', '저장소·URL에 이 탐색 상태를 쓰지 않는다']]),
  } },
} satisfies Meta<typeof HierarchyNav>;
export default meta;
type Story = StoryObj<typeof meta>;

/** `drill`(기본): 한 층씩 들어가고 위 경로로 올라온다. */
export const Drill: Story = {};
/** `tree`: 한 목록 안에서 펼치고 접는다. */
export const Tree: Story = { args: { mode: 'tree' } };
