import type { Meta, StoryObj } from '@storybook/react-vite';
import { PageKeyWarning, TableUrlWarning } from '@ap/components';
import { guidedPage } from '../guidance';

// Sentences as the hooks build them (useTableUrlWarning / usePageKeyRules): one per rejected key, in user words (ADR-0034).
const SORT = '정렬 “sideways”은 이 화면에서 쓸 수 없는 값입니다. 조건을 초기화하세요.';
const FILTER = '공정 “in:도금”은 이 화면에서 쓸 수 없는 필터입니다. 조건을 초기화하세요.';

/** 주소의 정렬·페이지·필터 값이 잘못됐을 때 표 자리에 대신 서는 안내. 값을 고쳐 쓰지 않고, «초기화»가 잘못된 키만 한 번에 지운다. */
const meta = {
  title: '조회·필터/TableUrlWarning',
  component: TableUrlWarning,
  args: { sentences: [SORT] },
  decorators: [Story => <div className="w-[720px]"><Story /></div>],
  parameters: { docs: {
    subtitle: '@ap/components · packages/sdk/components/src/table/tableUrlWarning.tsx (TableUrlWarning·PageKeyWarning)',
    page: guidedPage(
      [['docs/contract/kernel.md', '조회를 거부하고 명시적 오류를 표시하며 clamp/보정하지 않는다']],
      [['docs/contract/components.md', '사용자에게 보이는 문구에는 계약 상태어']],
    ),
  } },
} satisfies Meta<typeof TableUrlWarning>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 정렬 값이 잘못된 표(기본 제목). */
export const SortPage: Story = {};
/** `cause="filter"`: 필터 조건만 잘못됐다. */
export const Filter: Story = { args: { sentences: [FILTER], cause: 'filter', recoverKeys: ['filter'] } };
/** `cause="both"`: 정렬과 필터가 함께 잘못됐다. 문장은 키마다 하나다. */
export const Both: Story = { args: { sentences: [SORT, FILTER], cause: 'both', recoverKeys: ['sort', 'page', 'filter'] } };
/** `PageKeyWarning`: 표가 아닌 화면의 잘못된 페이지 키. `onRecover`가 그 키만 지운다. */
export const PageKey: Story = { render: () => <PageKeyWarning sentences={['공정 “도금”은 이 화면에서 쓸 수 없는 값입니다. 조건을 초기화하세요.']} onRecover={() => undefined} /> };
