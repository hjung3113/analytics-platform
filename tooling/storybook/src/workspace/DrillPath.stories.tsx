import type { Meta, StoryObj } from '@storybook/react-vite';
import { DrillPath } from '@ap/components';
import { guidedPage } from '../guidance';
import { drillPage, SIBLINGS, STEP2, STEP4 } from './drill';

/** 현재 메뉴 드릴의 경로 바 `전체 › <단계>: <값> › …`. 앞 칩을 누르면 그 단계로 올라가고 0단계에서는 그리지 않는다. */
const meta = {
  title: '페이지·작업 영역/DrillPath',
  component: DrillPath,
  args: { siblings: SIBLINGS },
  argTypes: { siblings: { control: false } },
  decorators: [Story => <div className="w-[720px]"><Story /></div>],
  parameters: { docs: {
    subtitle: '@ap/components · packages/sdk/components/src/archetypes/DrillLayout.tsx',
    page: guidedPage([], [['docs/contract/layout.md', '경로 바는 `PlatformPage`의 고정 breadcrumb(메뉴 위치)과도, 다른 메뉴로 돌아가는 복귀 버튼(§22)과도 다른 요소다']]),
  } },
} satisfies Meta<typeof DrillPath>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 2단계: 마지막 칩이 현재 단계(`aria-current="step"`)이고 ▾가 형제 값 목록이다. */
export const TwoSteps: Story = { decorators: [drillPage(STEP2)] };
/** 4단계: 칩이 다섯이 되면 `전체`와 마지막 두 칩만 두고 가운데를 `…` 메뉴로 접는다. */
export const Collapsed: Story = { decorators: [drillPage(STEP4)] };
