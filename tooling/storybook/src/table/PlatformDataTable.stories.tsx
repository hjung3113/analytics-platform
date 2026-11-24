import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { PlatformDataTable, type TableUrlState } from '@ap/components';
import { Button } from '@ap/ui';
import { COLUMNS, EQUIPMENT, type Eq } from '../equipment';
import { guidedPage } from '../guidance';

type Props = Partial<Parameters<typeof PlatformDataTable<Eq>>[0]>;
// `fill` inside a fixed-height box: the docs page is not the scroll container the page-fit cap measures, so all eight rows show.
const Table = (props: Props) => <div className="flex h-[440px] flex-col"><PlatformDataTable<Eq> title="설비 목록" ariaLabel="설비 목록 표"
  columns={COLUMNS} rows={EQUIPMENT} getRowId={e => e.id} preferenceKey="storybook:table:v1" fill {...props as object} /></div>;

/** 플랫폼 표. 정렬·열 설정·선택·내보내기·빈/로딩 상태를 표가 소유하고 메뉴는 열과 행만 선언한다. */
const meta = {
  title: '표 데이터/PlatformDataTable',
  component: PlatformDataTable,
  parameters: {
    docs: {
      subtitle: '@ap/components · packages/sdk/components/src/table/PlatformDataTable.tsx',
      page: guidedPage(
        [['docs/contract/components.md', '숫자는 오른쪽 정렬하고'], ['DESIGN.md', '표 헤더와 PlatformDataTable의 정렬 버튼은'], ['docs/contract/components.md', '표 소유 내보내기(#173)']],
        [['DESIGN.md', '색만으로 현재 위치·성공·실패 전달'], ['DESIGN.md', 'unknown을 0으로 만들거나']],
      ),
    },
  },
} satisfies Meta<typeof PlatformDataTable>;
export default meta;
type Story = StoryObj;

/** 기본 표: 설비 여덟 대, 숫자 열은 오른쪽 정렬. */
export const Default: Story = { render: () => <Table /> };

/** 행 선택: `bulkActions`를 주면 선택 열이 생기고, `activeRowId` 행은 왼쪽 막대로 표시한다. */
export const RowSelection: Story = {
  render: () => <Table activeRowId="EQ-0207" bulkActions={ids => <Button size="toolbar" variant="secondary">{ids.length}대 비교</Button>} />,
};

/** 정렬된 표: `urlState`로 가동률 내림차순을 제어한다. */
export const Sorted: Story = {
  render: function SortedStory() {
    const [state, setState] = useState<Pick<TableUrlState, 'page' | 'sorting'>>({ page: null, sorting: [{ id: 'util', desc: true }] });
    return <Table urlState={{ ...state, onChange: next => setState(next) }} />;
  },
};

/** 빈 결과: 행이 0개면 표가 빈 상태를 그린다. */
export const Empty: Story = { render: () => <Table rows={[]} /> };

/** 첫 로딩: `rowsLoading`이면 행 자리에 Skeleton을 둔다. */
export const Loading: Story = { render: () => <Table rows={[]} rowsLoading /> };
