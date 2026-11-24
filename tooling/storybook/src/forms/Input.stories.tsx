import type { Meta, StoryObj } from '@storybook/react-vite';
import { Input } from '@ap/ui';
import { guidedPage } from '../guidance';

/** 한 줄 텍스트 입력. 기본 40px, 표 toolbar 안에서는 32px `toolbar`. */
const meta = {
  title: '폼/Input',
  component: Input,
  args: { placeholder: '설비 ID (예: EQ-0142)', 'aria-label': '설비 ID' },
  decorators: [Story => <div className="w-80"><Story /></div>],
  parameters: {
    docs: {
      subtitle: '@ap/ui · packages/sdk/ui/src/components/shadcn/input.tsx',
      page: guidedPage(
        [['DESIGN.md', 'Input과 Select는 공유 기본 표면'], ['DESIGN.md', '구조선'], ['docs/contract/components.md', '오류 테두리는 각 입력이 칠한다']],
        [['DESIGN.md', 'input 경계를 hairline만으로 식별'], ['DESIGN.md', '버튼·input을 독자적으로 재설계하지 않는다']],
      ),
    },
  },
} satisfies Meta<typeof Input>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 기본 40px 입력. */
export const Default: Story = {};

/** 표 toolbar의 32px 입력(`inputSize="toolbar"`, `surface-sunken`). */
export const Toolbar: Story = { args: { inputSize: 'toolbar', placeholder: '검색' } };

/** 잘못된 값: `aria-invalid`이면 테두리가 danger가 된다. */
export const Invalid: Story = { args: { 'aria-invalid': true, defaultValue: 'EQ-14' } };

/** 비활성 입력. */
export const Disabled: Story = { args: { disabled: true, defaultValue: 'EQ-0142' } };

/** 읽기 전용: 값은 고를 수 있지만 고칠 수 없다. */
export const ReadOnly: Story = { args: { readOnly: true, defaultValue: 'EQ-0142', inputFont: 'mono' } };
