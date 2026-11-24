import type { Meta, StoryObj } from '@storybook/react-vite';
import { Skeleton, SkeletonBlocks, SkeletonRows } from '@ap/ui';
import { guidedPage } from '../guidance';

/** 첫 로딩 동안 결과가 놓일 자리를 미리 잡는다. 목록 행은 48px(`compact`)·56px(`regular`). */
const meta = {
  title: '표시/Skeleton',
  component: SkeletonRows,
  args: { count: 4, size: 'compact' },
  decorators: [Story => <div aria-busy="true" className="grid w-[480px] gap-2"><Story /></div>],
  parameters: {
    docs: {
      subtitle: '@ap/ui · packages/sdk/ui/src/components/SkeletonRows.tsx',
      page: guidedPage(
        [['DESIGN.md', '첫 load는 reserved geometry와 region `aria-busy`를 유지하며']],
        [['DESIGN.md', '공유 Skeleton의 기본 fill은 공유 UI 계약이 소유하며']],
      ),
    },
  },
} satisfies Meta<typeof SkeletonRows>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 48px 목록 행 네 줄. */
export const Rows: Story = {};

/** 낱개 `Skeleton`: 크기만 정하고 채움은 바꾸지 않는다. */
export const Blocks: Story = {
  render: () => <><Skeleton className="h-5 w-40" /><Skeleton className="h-24 w-full" /><Skeleton shape="rounded" className="h-8 w-24" /></>,
};

/** `SkeletonBlocks`: 상세 패널 로딩. 제목·배지·줄·본문 블록을 선언한 순서대로 그린다. */
export const DetailBlocks: Story = {
  render: () => <SkeletonBlocks blocks={[{ kind: 'title', size: 'large', width: 'half' }, { kind: 'badge', width: 'standard' },
    { kind: 'line', width: 'full' }, { kind: 'line', width: 'five-sixths' }, { kind: 'body', size: 'regular', width: 'full' }]} />,
};
