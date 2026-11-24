import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { MultiCombobox, type MultiComboboxProps } from '@ap/ui';
import { EQUIPMENT } from '../equipment';
import { guidedPage } from '../guidance';

const OPTIONS = EQUIPMENT.map(e => ({ value: e.id, label: e.id, description: e.process }));
// Every word is the caller's (the piece holds no copy).
const COPY = { label: '비교 설비', listboxLabel: '설비', emptyText: '결과 없음', placeholder: '설비 선택…', searchPlaceholder: '설비 ID 검색…',
  selectedSummaryLabel: (n: number) => `선택 ${n}대`, moreLabel: '더 보기', clearAllLabel: '모두 해제', removeLabel: (l: string) => `${l} 선택 해제`,
  loadingText: '불러오는 중…', retryLabel: '다시 시도' };

function Picker(props: Partial<MultiComboboxProps>) {
  const [values, setValues] = useState<string[]>([...(props.values ?? [])]);
  return <div className="w-80"><MultiCombobox {...COPY} options={OPTIONS} {...props as object} values={values} onValuesChange={setValues} /></div>;
}

/** 검색해 여러 개를 고른다. 고른 값은 칩으로 보이고 `maxVisibleChips`를 넘으면 «+N»으로 접힌다. 문구는 모두 호출자가 넘긴다. */
const meta = {
  title: '폼/MultiCombobox',
  component: MultiCombobox,
  args: { ...COPY, options: OPTIONS, values: ['EQ-0142', 'EQ-0408'], onValuesChange: () => {} },
  render: args => <Picker {...args} />,
  parameters: {
    docs: {
      subtitle: '@ap/ui · packages/sdk/ui/src/components/shadcn/multi-combobox.tsx',
      page: guidedPage(
        [['docs/contract/components.md', '`MultiCombobox`는 바깥 div의'], ['docs/contract/components.md', '`MultiCombobox`는 `aria-required`를 button에 넘기지 않는다']],
        [['DESIGN.md', '버튼·input을 독자적으로 재설계하지 않는다']],
      ),
    },
  },
} satisfies Meta<typeof MultiCombobox>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 두 대를 고른 상태. */
export const Selected: Story = {};

/** 고른 것이 칩 수를 넘으면 «+N»으로 접힌다(기본 2개). */
export const Overflow: Story = { args: { values: ['EQ-0142', 'EQ-0408', 'EQ-0604', 'EQ-0207'] } };

/** 선택 상한: `maxSelected`와 그 안내 문구를 함께 준다. */
export const MaxSelected: Story = { args: { maxSelected: 3, maxSelectedText: '최대 3대까지 고를 수 있습니다.' } };

/** 표 toolbar용 32px(`density="compact"`). */
export const Compact: Story = { args: { density: 'compact' } };

/** 잘못된 값: 바깥 테두리가 danger가 된다. */
export const Invalid: Story = { args: { values: [], 'aria-invalid': true } };
