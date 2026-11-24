import type { Meta, StoryObj } from '@storybook/react-vite';
import { PageConditionTree } from '@ap/components';
import { guidedPage } from '../guidance';
import { DECLARATION, INPUTS_KEY, SOURCE, TREE, useConditionValues } from './pageConditions';

function Tree({ initial }: { initial: string[] }) {
  const { values, onChange } = useConditionValues(initial.length ? { node: initial } : {});
  return <div className="h-[360px] w-[360px] border border-border-subtle">
    <PageConditionTree category={TREE} declaration={DECLARATION} values={values} onChange={onChange} source={SOURCE} inputsKey={INPUTS_KEY} />
  </div>;
}

/** `tree` 범주 하나를 메뉴가 준 `HierarchySource`로 지연 로딩하는 체크 트리. 검색 결과와 아직 안 읽은 선택값은 `A › B › C` 경로로 복원한다. */
const meta = {
  title: '조회·필터/PageConditionTree',
  component: PageConditionTree,
  parameters: { docs: {
    subtitle: '@ap/components · packages/sdk/components/src/filters/PageConditionTree.tsx',
    page: guidedPage([['docs/contract/components.md', '연결한 source는 메뉴가 Kernel 요청 게이트와 서버 권한 판정을 보존해']]),
  } },
  render: () => <Tree initial={['EQ-0207', 'EQ-0412']} />,
} satisfies Meta<typeof PageConditionTree>;
export default meta;
type Story = StoryObj;

/** 증착 설비 둘을 고른 상태(`value: 'leaves'`). */
export const Selected: Story = {};
/** 고른 것 없음: «제약 없음». */
export const Unconstrained: Story = { render: () => <Tree initial={[]} /> };
