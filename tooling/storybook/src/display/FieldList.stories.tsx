import type { Meta, StoryObj } from '@storybook/react-vite';
import { FieldList, FieldRow } from '@ap/ui';
import { guidedPage } from '../guidance';

/** 라벨–값 쌍 목록. `FieldList`(`dl`) 안의 `FieldRow`는 `dt`/`dd`로 그려져 화면 낭독기가 쌍으로 읽는다. */
const meta = {
  title: '표시/FieldList',
  component: FieldList,
  args: { children: null },
  argTypes: { children: { control: false } },
  render: args => <div className="w-[420px]"><FieldList {...args}>
    <FieldRow label="설비" layout="detail" mono>EQ-0207</FieldRow>
    <FieldRow label="공정" layout="detail">증착</FieldRow>
    <FieldRow label="가동률(7일)" layout="detail">72.5%</FieldRow>
    <FieldRow label="사이클타임" layout="detail">176초</FieldRow>
  </FieldList></div>,
  parameters: {
    docs: {
      subtitle: '@ap/ui · packages/sdk/ui/src/panel/FieldList.tsx · FieldRow.tsx',
      page: guidedPage([['docs/contract/components.md', '넘치면 줄을 바꾸고 값을 자르지 않는다'], ['docs/contract/components.md', '배지는 `dl` 밖 형제로 둔다']]),
    },
  },
} satisfies Meta<typeof FieldList>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 상세 패널 속성 목록(`FieldRow layout="detail"`): 9rem 라벨 열, 나눈 행, 식별자는 `mono`. */
export const Detail: Story = {};

/** `layout="inline"`: 제목 아래 한 줄 메타, 넘치면 줄을 바꾼다. */
export const Inline: Story = {
  render: args => <div className="w-[360px]"><FieldList {...args} layout="inline">
    <FieldRow label="공정">증착</FieldRow><FieldRow label="라인">2라인</FieldRow>
    <FieldRow label="담당">홍길동</FieldRow><FieldRow label="최근 보전">2026-11-04</FieldRow>
  </FieldList></div>,
};
