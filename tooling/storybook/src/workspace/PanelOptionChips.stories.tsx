import type { Meta, StoryObj } from '@storybook/react-vite';
import { PanelOptionChips } from '@ap/components';
import { guidedPage } from '../guidance';
import { AlarmPanel, optionsPage } from './panels';

/** 기본과 다른 패널 옵션마다 패널 머리 칩 하나. ×는 그 옵션만 기본으로 돌린다. 모두 기본이면 아무것도 그리지 않는다. */
const meta = {
  title: '페이지·작업 영역/PanelOptionChips',
  component: PanelOptionChips,
  decorators: [Story => <div className="w-[720px]"><Story /></div>, optionsPage('?barsSort=name&barsGroup=process&barsLabels=1')],
  parameters: { docs: {
    subtitle: '@ap/components · packages/sdk/components/src/workspace/PanelOptions.tsx',
    page: guidedPage([], [['docs/contract/layout.md', '«기본과 다름» 문장은 쓰지 않는다']]),
  } },
  render: () => <AlarmPanel />,
} satisfies Meta<typeof PanelOptionChips>;
export default meta;
type Story = StoryObj;

/** 세 옵션을 바꾼 주소: 제목 옆 «이름순 ×», «공정별 ×», «값 표시 ×». */
export const Changed: Story = {};
