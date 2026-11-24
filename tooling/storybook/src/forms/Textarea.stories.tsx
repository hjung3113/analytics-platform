import type { Meta, StoryObj } from '@storybook/react-vite';
import { Textarea } from '@ap/ui';
import { guidedPage } from '../guidance';

/** 여러 줄 텍스트 입력. 최소 높이 80px, 크기 조절 손잡이는 없다. */
const meta = {
  title: '폼/Textarea',
  component: Textarea,
  args: { placeholder: '조치 내용을 적으세요', 'aria-label': '조치 내용' },
  decorators: [Story => <div className="w-96"><Story /></div>],
  parameters: {
    docs: {
      subtitle: '@ap/ui · packages/sdk/ui/src/components/shadcn/textarea.tsx',
      page: guidedPage(
        [['docs/contract/components.md', '오류 테두리는 각 입력이 칠한다']],
        [['DESIGN.md', '버튼·input을 독자적으로 재설계하지 않는다']],
      ),
    },
  },
} satisfies Meta<typeof Textarea>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 빈 입력. */
export const Default: Story = {};

/** 내용이 있는 입력. */
export const Filled: Story = { args: { defaultValue: 'EQ-0207 진공 펌프 교체 후 누설 점검 완료.\n챔버 압력 정상 범위 복귀 확인.' } };

/** 잘못된 값: `aria-invalid`이면 테두리가 danger가 된다. */
export const Invalid: Story = { args: { 'aria-invalid': true } };

/** 비활성. */
export const Disabled: Story = { args: { disabled: true, defaultValue: '승인된 조치는 고칠 수 없습니다.' } };
