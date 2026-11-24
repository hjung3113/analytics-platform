import type { Meta, StoryObj } from '@storybook/react-vite';
import { PanelRecipeBack } from '@ap/components';
import { guidedPage } from '../guidance';
import { RecipeBack, workspacePage } from './workspace';

/** 패널 뒷면 «이 패널 만든 방법»: 메뉴가 선언한 것 → 가져다 쓴 SDK 조각 → 플랫폼이 붙여 준 것의 세 열. 내용은 `panelRecipe`가 만든다. */
const meta = {
  title: '페이지·작업 영역/PanelRecipeBack',
  component: PanelRecipeBack,
  decorators: [Story => <div className="h-[360px] w-[960px] border border-border-subtle"><Story /></div>, workspacePage],
  parameters: { docs: {
    subtitle: '@ap/components · packages/sdk/components/src/panel-recipe/PanelRecipeBack.tsx',
    page: guidedPage([['docs/contract/components.md', 'the SDK reads no menu-only declaration field']]),
  } },
  render: () => <RecipeBack id="util" close={() => undefined} />,
} satisfies Meta<typeof PanelRecipeBack>;
export default meta;
type Story = StoryObj;

/** 차트 패널: 확대·구간이 켜져 있고, 메뉴가 켠 내보내기에 따라 CSV가 켜진다. */
export const Chart: Story = {};
/** 표 패널: 차트 조각이 없어 확대·구간과 CSV가 꺼져 있다. */
export const Table: Story = { render: () => <RecipeBack id="alarms" close={() => undefined} /> };
