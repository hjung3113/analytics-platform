import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { DatePicker, type DatePickerProps } from '@ap/ui';
import { guidedPage } from '../guidance';

function Picker(props: Partial<DatePickerProps>) {
  const [value, setValue] = useState<string | null>(props.value ?? null);
  return <div className="w-60"><DatePicker aria-label="점검일" {...props} value={value} onChange={setValue} /></div>;
}

/** 날짜 하나를 `YYYY-MM-DD`로 입력하거나 달력에서 고른다. 형식·범위 오류는 칸을 벗어난 뒤(또는 `showValidation`) 보인다. */
const meta = {
  title: '폼/DatePicker',
  component: DatePicker,
  args: { value: '2026-11-14', onChange: () => {} },
  render: args => <Picker {...args} />,
  parameters: {
    docs: {
      subtitle: '@ap/ui · packages/sdk/ui/src/forms/DatePicker.tsx',
      page: guidedPage(),
    },
  },
} satisfies Meta<typeof DatePicker>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 값이 있는 상태: 오른쪽에 지우기와 달력 열기. */
export const Default: Story = {};

/** 빈 값: 형식 자리 문구. */
export const Empty: Story = { args: { value: null } };

/** 범위 밖 값(`min` 2026-11-01): `showValidation`이면 바로 오류 문구가 보인다. */
export const OutOfRange: Story = { args: { value: '2026-10-28', min: '2026-11-01', max: '2026-11-30', showValidation: true } };

/** 상세 패널 안 표면(`appearance="detail"`). */
export const Detail: Story = { args: { appearance: 'detail' } };

/** 비활성. */
export const Disabled: Story = { args: { disabled: true } };
