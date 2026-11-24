import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ApiResponse } from '@ap/contracts';
import type { QueryState } from '@ap/kernel';
import { QueryView } from '@ap/components';
import { answer, EQUIPMENT, type Eq } from '../equipment';
import { guidedPage } from '../guidance';

// A query state as `useMenuQuery` returns it; the stories set it by hand (no backend).
const query = (status: QueryState<Eq[]>['status'], response: ApiResponse<Eq[]> | null = null, missing: QueryState<Eq[]>['missing'] = []): QueryState<Eq[]> =>
  ({ status, missing, completedAt: response ? Date.UTC(2026, 10, 14) : null, response, refetch: () => undefined });
const List = (rows: Eq[]) => <ul className="divide-y divide-border-subtle text-sm">{rows.slice(0, 5).map(e =>
  <li key={e.id} className="flex justify-between py-1.5"><span className="t-mono">{e.id}</span><span className="tabular">{e.util.toFixed(1)}%</span></li>)}</ul>;

/** 조회 경계. 첫 로딩은 Skeleton, 같은 조건의 갱신은 값을 둔 채 띠로 알리고, 그 밖의 결과는 §19 상태(0건·권한 없음·오류 등)로 그린다. `ok`일 때만 `children`을 부른다. */
const meta = {
  title: '표시/QueryView',
  component: QueryView,
  decorators: [Story => <div className="relative w-[480px] rounded-md border border-border-subtle p-4"><Story /></div>],
  parameters: { docs: {
    subtitle: '@ap/components · packages/sdk/components/src/StateView.tsx',
    page: guidedPage(
      [['docs/contract/components.md', '`QueryView`는 `status=refreshing`인 동안에만'], ['docs/contract/components.md', '성공한 조회가 0건이라는 사실만 확인되면']],
      [['docs/contract/components.md', '`No Data` 하나로 합치지 않는다']],
    ),
  } },
  args: { query: query('done', answer('ok', EQUIPMENT)), children: List, widgetName: '설비 가동률' },
  argTypes: { query: { control: false }, children: { control: false } },
} satisfies Meta<typeof QueryView<Eq[]>>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 결과 있음: `children`이 데이터를 그린다. */
export const Done: Story = {};
/** 조회 전: 필수 조건(기간)이 비어 있다. */
export const Idle: Story = { args: { query: query('idle', null, [{ key: 'time', label: { ko: '기간', en: 'Period' } }]) } };
/** 첫 로딩: 자리를 잡은 Skeleton. */
export const Loading: Story = { args: { query: query('loading') } };
/** 같은 조건으로 갱신 중: 값을 둔 채 아래 가장자리 띠로 알린다. */
export const Refreshing: Story = { args: { query: query('refreshing', answer('ok', EQUIPMENT)) } };
/** 0건(`empty`). */
export const Empty: Story = { args: { query: query('done', answer('empty')) } };
/** 권한 없음(`forbidden`). */
export const Forbidden: Story = { args: { query: query('done', answer('forbidden')) } };
/** 시간 초과(`timeout`): 다시 시도 동작. */
export const Timeout: Story = { args: { query: query('done', answer('timeout')) } };
