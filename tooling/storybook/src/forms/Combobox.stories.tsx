import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Combobox, type ComboboxProps } from '@ap/ui';
import { EQUIPMENT } from '../equipment';
import { guidedPage } from '../guidance';

const OPTIONS = EQUIPMENT.map(e => ({ value: e.id, label: `${e.id} · ${e.process}` }));

// The selection is controlled, as a menu holds it.
function Picker(props: Partial<ComboboxProps>) {
  const [value, setValue] = useState<string | null>(props.value ?? null);
  return <div className="w-72"><Combobox options={OPTIONS} placeholder="설비 선택…" searchPlaceholder="설비 ID 검색…" listboxLabel="설비" {...props} value={value} onChange={setValue} /></div>;
}

/** 긴 목록에서 검색해 하나를 고른다. 트리거는 Input과 같은 40px 필드, 목록은 Popover 안의 검색 입력과 listbox다. */
const meta = {
  title: '폼/Combobox',
  component: Combobox,
  args: { options: OPTIONS, value: 'EQ-0142', onChange: () => {} },
  render: args => <Picker {...args} />,
  parameters: {
    docs: {
      subtitle: '@ap/ui · packages/sdk/ui/src/components/shadcn/combobox.tsx',
      page: guidedPage(
        [['docs/contract/components.md', '`Combobox`는 트리거 button에 둘 다 전달하고'], ['docs/contract/components.md', '오류 테두리는 각 입력이 칠한다']],
        [['DESIGN.md', '버튼·input을 독자적으로 재설계하지 않는다']],
      ),
    },
  },
} satisfies Meta<typeof Combobox>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 고른 상태. */
export const Selected: Story = {};

/** 아직 고르지 않은 상태: 자리 문구가 보인다. */
export const Empty: Story = { args: { value: null } };

/** 표 toolbar용 32px(`density="compact"`)와 ID 고정폭 글꼴(`font="mono"`). */
export const CompactMono: Story = { args: { density: 'compact', font: 'mono' } };

/** 잘못된 값: 트리거 테두리가 danger가 된다. */
export const Invalid: Story = { args: { value: null, 'aria-invalid': true } };

/** 비활성: 목록을 열 수 없다. */
export const Disabled: Story = { args: { disabled: true } };
