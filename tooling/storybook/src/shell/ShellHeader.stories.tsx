import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, ShellHeader, ToolbarKicker } from '@ap/ui';
import { guidedPage } from '../guidance';

/** 세 셸과 상세 패널이 함께 쓰는 50px 머리. 왼쪽에 제목·부제, 오른쪽에 동작. 높이는 바꾸지 않는다. */
const meta = {
  title: '셸·패널/ShellHeader',
  component: ShellHeader,
  args: { title: '설비 현황', subtitle: '식각 · 증착 · 세정', actions: <Button size="toolbar" variant="secondary">내보내기</Button> },
  decorators: [Story => <div className="w-[720px] border border-border-subtle"><Story /></div>],
  parameters: {
    docs: {
      subtitle: '@ap/ui · packages/sdk/ui/src/layout/ShellHeader.tsx',
      page: guidedPage([['docs/contract/layout.md', '(--toolbar-height)']]),
    },
  },
} satisfies Meta<typeof ShellHeader>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 페이지 머리(`variant="default"`). */
export const Default: Story = {};

/** 목록·작업대 위 툴바(`variant="toolbar"`). */
export const Toolbar: Story = { args: { variant: 'toolbar', subtitle: undefined } };

/** 상세 패널 머리(`variant="drawer"`). */
export const Drawer: Story = { args: { variant: 'drawer', title: 'EQ-0207', subtitle: '증착 · 2라인', actions: undefined } };

/** 빽빽한 작업대 툴바의 경로 표시(`ToolbarKicker`): 라벨 · 이름. */
export const WithKicker: Story = {
  args: { variant: 'toolbar', subtitle: undefined, title: <span className="flex items-center"><ToolbarKicker label="작업대" name="알람 분류" />미분류 12건</span> },
};
