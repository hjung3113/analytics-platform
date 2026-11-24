import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Checkbox, FieldLabel, FormField, Input, Label, LineErrorList, RequiredMark, Textarea, validateLines } from '@ap/ui';
import { guidedPage } from '../guidance';

/**
 * 라벨 → 입력 → 도움말 → 오류를 묶는 필드. `children`은 렌더 함수이고 받은 `control`(id·aria-*)을 입력 하나에 펼친다.
 * 라벨은 `FieldLabel`(`Label` + 필수 표식 `RequiredMark` + 도움말 ⓘ), 여러 줄 입력의 줄별 오류는 `LineErrorList`가 보인다.
 */
const meta = {
  title: '폼/폼 필드',
  component: FormField,
  args: { label: '설비 ID', hint: '예: EQ-0142', children: control => <Input {...control} defaultValue="EQ-0142" /> },
  argTypes: { children: { control: false } },
  decorators: [Story => <div className="w-80"><Story /></div>],
  parameters: {
    docs: {
      subtitle: '@ap/ui · packages/sdk/ui/src/forms/FormField.tsx · FieldLabel.tsx · LineErrors.tsx',
      page: guidedPage(
        [['docs/contract/components.md', '**항상 보이고** 오류가 나도 남는다'], ['docs/contract/components.md', '호출하는 쪽은 제출하거나 칸을 벗어날 때'],
          ['docs/contract/components.md', '한 필드에 입력이 여럿이면 `FormField`를 나눈다']],
        [['docs/contract/components.md', '오류에는 기본적으로 `role="alert"`'], ['docs/contract/components.md', '감싸개는 테두리를 칠하지 않는다']],
      ),
    },
  },
} satisfies Meta<typeof FormField>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 라벨·입력·도움말. */
export const Default: Story = {};

/** 필수(`required`): 라벨에 `*`, 입력에 `aria-required`. 라벨 옆 ⓘ 도움말(`tip`). */
export const Required: Story = { args: { required: true, tip: '설비 대장에 등록된 ID' } };

/** 제출 뒤 오류: 도움말은 남고 그 아래 오류가 더해지며 입력 테두리가 danger가 된다. */
export const WithError: Story = { args: { required: true, error: '등록되지 않은 설비 ID입니다.', children: control => <Input {...control} defaultValue="EQ-9999" /> } };

/** `FieldLabel`·`RequiredMark`·`Label`: 필수 표식 두 모양(`*`, «· 필수»), 구역 라벨(`appearance="section"`), 체크박스 옆 기본 `Label`. */
export const Labels: Story = {
  render: () => <div className="grid gap-3">
    <FieldLabel required>점검 담당자</FieldLabel>
    <FieldLabel required requiredMark="text">점검 사유</FieldLabel>
    <FieldLabel appearance="section">설비 정보</FieldLabel>
    <span className="text-sm">따로 그린 표식<RequiredMark /><RequiredMark mark="text" /></span>
    <div className="flex items-center gap-2"><Checkbox id="notify" /><Label htmlFor="notify">담당자에게 알림</Label></div>
  </div>,
};

// One equipment ID per line; at most 4 lines.
const rule = (line: string) => (/^EQ-\d{4}$/.test(line.trim()) ? null : '설비 ID 형식(EQ-0000)이 아닙니다.');
function BulkIds() {
  const [text, setText] = useState('EQ-0142\nEQ-14\nEQ-0408\nEQ-04O8\nEQ-0604');
  const errors = validateLines(text, rule, { maxLines: 4, maxLinesMessage: '최대 4행까지 입력할 수 있습니다.' });
  // The list is a <ul>, so it sits after the field and joins the input's description through `describedBy`.
  return <div className="grid gap-1.5">
    <FormField label="설비 ID 목록" hint="한 줄에 하나, 최대 4행" describedBy="bulk-errors">
      {control => <Textarea {...control} aria-invalid={errors.length > 0 || undefined} rows={5} value={text} onChange={event => setText(event.target.value)} />}
    </FormField>
    <LineErrorList id="bulk-errors" errors={errors} />
  </div>;
}

/** 여러 줄 입력의 줄별 오류: `validateLines`가 줄을 검사하고 `LineErrorList`가 처음 5개와 «외 n건»을 보인다. 상한 다음 줄도 오류다. */
export const LineErrors: Story = { render: () => <BulkIds /> };
