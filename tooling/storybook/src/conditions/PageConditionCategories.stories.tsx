import type { Meta, StoryObj } from '@storybook/react-vite';
import { PageConditionCategories } from '@ap/components';
import type { PageConditionValues } from '@ap/kernel';
import { guidedPage } from '../guidance';
import { DECLARATION, INITIAL, INPUTS_KEY, loadOptions, TREE_SOURCES, useConditionValues } from './pageConditions';

function Categories({ initial = INITIAL }: { initial?: PageConditionValues }) {
  const { values, onChange } = useConditionValues(initial);
  return <div className="w-[360px] border border-border-subtle">
    <PageConditionCategories declaration={DECLARATION} values={values} onChange={onChange} loadOptions={loadOptions} treeSources={TREE_SOURCES} inputsKey={INPUTS_KEY} />
  </div>;
}

/** 메뉴가 선언한 페이지 조건 범주(`MenuMeta.pageConditions`)를 선언 순서대로 그리는 제어형 편집기. 값은 S1 키 맵이고 범주마다 «지우기»가 있다. */
const meta = {
  title: '조회·필터/PageConditionCategories',
  component: PageConditionCategories,
  parameters: { docs: {
    subtitle: '@ap/components · packages/sdk/components/src/filters/PageConditionCategories.tsx',
    page: guidedPage(
      [['docs/contract/components.md', 'callback은 해당 범주 소유 키 맵 전체를 교체하고']],
      [['docs/contract/components.md', '이 모델이나 표 툴바를 대체하지 않는다']],
    ),
  } },
  render: () => <Categories />,
} satisfies Meta<typeof PageConditionCategories>;
export default meta;
type Story = StoryObj;

/** 식각·설비 둘·기간을 고른 상태. 설비 목록은 옵션 로더가 주고 EQ-0519는 «정비 중»으로 막혀 있다. 레시피는 비활성 사유를 보인다. */
export const Selected: Story = {};
/** 아무 조건도 없는 상태: 키가 없으면 «제약 없음», 필수인 기간은 값을 요구한다. */
export const Empty: Story = { render: () => <Categories initial={{}} /> };
