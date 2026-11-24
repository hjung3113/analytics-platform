import type { Meta, StoryObj } from '@storybook/react-vite';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ap/ui';
import { guidedPage } from '../guidance';

const PROCESSES = ['식각', '증착', '세정'];

/** 정해진 값 중 하나를 고른다. 트리거는 Input과 같은 40px 필드다. */
const meta = {
  title: '폼/Select',
  component: Select,
  args: { defaultValue: '식각' },
  render: args => <div className="w-60"><Select {...args}>
    <SelectTrigger aria-label="공정"><SelectValue /></SelectTrigger>
    <SelectContent>{PROCESSES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
  </Select></div>,
  parameters: {
    docs: {
      subtitle: '@ap/ui · packages/sdk/ui/src/components/shadcn/select.tsx',
      page: guidedPage(
        [['DESIGN.md', 'Input과 Select는 공유 기본 표면'], ['docs/contract/components.md', '분류 값은 `Select`를 사용하며']],
        [['DESIGN.md', '버튼·input을 독자적으로 재설계하지 않는다']],
      ),
    },
  },
} satisfies Meta<typeof Select>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 닫힌 상태. */
export const Closed: Story = {};

/** 열린 목록. */
export const Open: Story = { args: { defaultOpen: true }, parameters: { docs: { story: { inline: false, height: '200px' } } } };
