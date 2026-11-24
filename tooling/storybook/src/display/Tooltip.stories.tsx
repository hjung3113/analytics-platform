import type { Meta, StoryObj } from '@storybook/react-vite';
import { Copy } from 'lucide-react';
import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@ap/ui';
import { guidedPage } from '../guidance';

/** hover와 키보드 포커스로 뜨는 짧은 이름표. 아이콘 버튼의 이름이나 잘린 글의 전체를 보인다. */
const meta = {
  title: '표시/Tooltip',
  component: Tooltip,
  args: { open: true },
  decorators: [Story => <TooltipProvider><div className="p-6 pt-14"><Story /></div></TooltipProvider>],
  parameters: {
    docs: {
      story: { inline: false, iframeHeight: 140 },
      subtitle: '@ap/ui · packages/sdk/ui/src/components/shadcn/tooltip.tsx',
      page: guidedPage(
        [['DESIGN.md', 'copy Tooltip과 표 column menu도 공유 floating 표면'], ['DESIGN.md', '전체 이름은 제목 툴팁과 `title`로 남는다']],
        [['docs/contract/components.md', '경고·부분 데이터·미완료 상태·권한 안내·상태 배지는 ⓘ로 숨기지 않고']],
      ),
    },
  },
  render: args => <Tooltip {...args}>
    <TooltipTrigger asChild><Button size="icon-sm" variant="ghost" aria-label="링크 복사"><Copy className="size-4" aria-hidden /></Button></TooltipTrigger>
    <TooltipContent>링크 복사</TooltipContent>
  </Tooltip>,
} satisfies Meta<typeof Tooltip>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 열린 상태(`open`): 아이콘 버튼의 이름. */
export const Open: Story = {};

/** 작은 글자(`size="sm"`), 오른쪽에 띄움. */
export const Small: Story = {
  render: args => <Tooltip {...args}>
    <TooltipTrigger asChild><span className="t-mono text-sm">EQ-0207</span></TooltipTrigger>
    <TooltipContent size="sm" side="right">증착 · 가동률 72.5%</TooltipContent>
  </Tooltip>,
};
