import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from '@ap/ui';
import { guidedPage } from '../guidance';

/** 범주나 짧은 표식을 붙이는 배지. 확인된 상태는 StatusBadge가 맡는다. */
const meta = {
  title: '표시/Badge',
  component: Badge,
  args: { variant: 'secondary', children: '식각' },
  parameters: {
    docs: {
      subtitle: '@ap/ui · packages/sdk/ui/src/components/shadcn/badge.tsx',
      page: guidedPage(
        [['DESIGN.md', '범주/제품 milestone label은 성공 판정과 다르다']],
        [['DESIGN.md', '평범한 label에 새 상태 색을 만들지 않는다']],
      ),
    },
  },
} satisfies Meta<typeof Badge>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 공정 범주 배지(secondary). */
export const Default: Story = {};

/** variant 네 가지. */
export const Variants: Story = {
  render: () => <div className="flex gap-2">{(['default', 'secondary', 'outline', 'destructive'] as const).map(variant =>
    <Badge key={variant} variant={variant}>{variant}</Badge>)}</div>,
};
