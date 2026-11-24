import type { Meta, StoryObj } from '@storybook/react-vite';
import { LoadingBlock } from '@ap/components';
import { guidedPage } from '../guidance';

/** 첫 로딩 동안 결과 자리를 잡는 Skeleton 줄. `role="status"`·`aria-busy`로 «불러오는 중»을 알린다. 높이·줄 수만 정한다. */
const meta = {
  title: '표시/LoadingBlock',
  component: LoadingBlock,
  decorators: [Story => <div className="w-[480px]"><Story /></div>],
  parameters: { docs: {
    subtitle: '@ap/components · packages/sdk/components/src/StateView.tsx',
    page: guidedPage([['DESIGN.md', '첫 load는 reserved geometry와']], [['DESIGN.md', '크기만 지정하고 fill을 덮어쓰지 않는다']]),
  } },
} satisfies Meta<typeof LoadingBlock>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 기본: 세 줄, 최소 높이 96px. */
export const Default: Story = {};
/** 차트 자리: 다섯 줄, 240px. */
export const Tall: Story = { args: { rows: 5, height: 240 } };
