import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatusBadge } from '@ap/ui';
import { guidedPage } from '../guidance';

const TONES = [['success', '가동'], ['warning', '점검 필요'], ['danger', '정지'], ['neutral', '미평가'], ['info', '예약됨']] as const;

/** 확인된 상태를 글자와 색으로 함께 알리는 배지. tone은 다섯 가지다. */
const meta = {
  title: '표시/StatusBadge',
  component: StatusBadge,
  args: { tone: 'success', children: '가동', dot: true },
  parameters: {
    docs: {
      subtitle: '@ap/ui · packages/sdk/ui/src/components/StatusBadge.tsx',
      page: guidedPage(
        [['DESIGN.md', '`StatusBadge` vocabulary는'], ['DESIGN.md', 'text+icon/shape로 의미를 함께 전달한다']],
        [['DESIGN.md', 'unknown·permission 제한·미수집을 화면 임의로'], ['DESIGN.md', '평범한 label에 새 상태 색을 만들지 않는다']],
      ),
    },
  },
} satisfies Meta<typeof StatusBadge>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 점이 있는 기본(soft) 배지. */
export const Default: Story = {};

/** tone 다섯 가지를 soft와 outline으로 나란히 본다. */
export const Tones: Story = {
  render: () => <div className="grid gap-2">{(['soft', 'outline'] as const).map(variant => <div key={variant} className="flex gap-2">
    {TONES.map(([tone, label]) => <StatusBadge key={tone} tone={tone} variant={variant} dot>{label}</StatusBadge>)}
  </div>)}</div>,
};
