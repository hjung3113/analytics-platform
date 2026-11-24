import type { Meta, StoryObj } from '@storybook/react-vite';
import { OutcomeView } from '@ap/components';
import { Button } from '@ap/ui';
import { answer, EQUIPMENT, type Eq } from '../equipment';
import { guidedPage } from '../guidance';

/** 조회 상태 없이 응답 하나를 §19 상태로 그린다(공유 상태 띠에 등록하지 않는 단독 부품). 조회 수명은 QueryView가 맡는다. */
const meta = {
  title: '표시/OutcomeView',
  component: OutcomeView,
  decorators: [Story => <div className="w-[480px] rounded-md border border-border-subtle p-4"><Story /></div>],
  parameters: { docs: {
    subtitle: '@ap/components · packages/sdk/components/src/StateView.tsx',
    page: guidedPage([['docs/contract/components.md', '성공한 조회가 0건이라는 사실만 확인되면']], [['docs/contract/components.md', '`No Data` 하나로 합치지 않는다']]),
  } },
  args: { response: answer('ok', EQUIPMENT), onRetry: () => undefined, children: (rows: Eq[]) => <p className="text-sm">설비 {rows.length}대를 받았습니다.</p> },
  argTypes: { response: { control: false }, children: { control: false } },
} satisfies Meta<typeof OutcomeView<Eq[]>>;
export default meta;
type Story = StoryObj<typeof meta>;

/** `ok`: `children`만 그린다. */
export const Ok: Story = {};
/** `empty`와 `emptyAction`: 조건을 바꾸는 동작 하나. */
export const Empty: Story = { args: { response: answer('empty'), emptyAction: <Button size="sm" variant="secondary">기간 넓히기</Button> } };
/** `too_large`: 범위가 너무 넓어 거부됐다. */
export const TooLarge: Story = { args: { response: answer('too_large') } };
/** `error`, `compact`: 좁은 칸의 작은 상태. */
export const ErrorCompact: Story = { args: { response: answer('error'), compact: true } };
