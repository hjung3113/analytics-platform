import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChevronDown } from 'lucide-react';
import { Button, DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@ap/ui';
import { guidedPage } from '../guidance';

/** 메뉴 버튼이 여는 동작 목록. 항목을 실행하거나 켜고 끈다. */
const meta = {
  title: '떠 있는 표면/DropdownMenu',
  component: DropdownMenu,
  args: { open: true, modal: false },
  parameters: {
    docs: {
      story: { inline: false, iframeHeight: 240 },
      subtitle: '@ap/ui · packages/sdk/ui/src/components/shadcn/dropdown-menu.tsx',
      page: guidedPage(
        [['DESIGN.md', '▾는 메뉴 버튼에만 둔다'], ['DESIGN.md', '보조 동작은 있으면 ⋯ 메뉴에 두며']],
        [['DESIGN.md', '표에 따로 둔']],
      ),
    },
  },
} satisfies Meta<typeof DropdownMenu>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 열린 동작 메뉴: 제목·항목·구분선·비활성 항목. */
export const Open: Story = {
  render: args => <div className="p-6"><DropdownMenu {...args}>
    <DropdownMenuTrigger asChild><Button size="toolbar" variant="secondary">내보내기 <ChevronDown className="size-4" aria-hidden /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="start">
      <DropdownMenuLabel>설비 목록 8대</DropdownMenuLabel>
      <DropdownMenuItem>CSV로 내보내기</DropdownMenuItem>
      <DropdownMenuItem>Excel로 내보내기</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem disabled>PDF로 내보내기(권한 없음)</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu></div>,
};

/** 체크 항목: 보일 열을 켜고 끈다. */
export const Checkbox: Story = {
  render: args => <div className="p-6"><DropdownMenu {...args}>
    <DropdownMenuTrigger asChild><Button size="toolbar" variant="secondary">컬럼 <ChevronDown className="size-4" aria-hidden /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="start">
      {([['가동률(%)', true], ['사이클타임(초)', true], ['알람(건)', false]] as const).map(([label, on]) =>
        <DropdownMenuCheckboxItem key={label} checked={on}>{label}</DropdownMenuCheckboxItem>)}
    </DropdownMenuContent>
  </DropdownMenu></div>,
};
