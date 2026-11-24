import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { SearchInput, type SearchInputProps } from '@ap/ui';
import { guidedPage } from '../guidance';

function Search(props: Partial<SearchInputProps>) {
  const [value, setValue] = useState(props.value ?? '');
  return <div className="w-72"><SearchInput aria-label="설비 검색" clearLabel="검색 지우기" placeholder="설비 ID 검색…" {...props} value={value} onValueChange={setValue} /></div>;
}

/** 검색어 입력. Esc는 지우고 Enter·칸 벗어남이 `onCommit`이다. `onValueChange`가 없으면 비활성 자리 표시가 된다. */
const meta = {
  title: '폼/SearchInput',
  component: SearchInput,
  args: { value: 'EQ-04' },
  render: args => <Search {...args} />,
  parameters: {
    docs: {
      subtitle: '@ap/ui · packages/sdk/ui/src/forms/SearchInput.tsx',
      page: guidedPage(
        [['docs/contract/components.md', '`SearchInput size="toolbar"`는 `aria-label`·`clearLabel`을 받고'], ['DESIGN.md', 'checkbox·검색·filter 경계는']],
      ),
    },
  },
} satisfies Meta<typeof SearchInput>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 검색어가 있는 상태. */
export const Default: Story = {};

/** 표 toolbar용 32px(`size="toolbar"`): 브라우저 지우기 대신 칸 안 지우기 버튼 하나(`clearLabel`). */
export const Toolbar: Story = { args: { size: 'toolbar' } };

/** 검색 기능이 아직 없는 화면: `onValueChange` 없이 쓰면 비활성이고 포커스하면 이유를 알린다. */
export const Unavailable: Story = { render: () => <div className="w-72"><SearchInput aria-label="설비 검색" placeholder="설비 ID 검색…" /></div> };
