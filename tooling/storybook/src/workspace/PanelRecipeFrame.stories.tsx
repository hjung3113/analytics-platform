import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState, type ReactNode } from 'react';
import { PANEL_RECIPE_ITEM, PanelRecipeFrame, PanelWorkspace } from '@ap/components';
import { guidedPage } from '../guidance';
import { PANELS, PRESETS, RecipeBack, workspacePage } from './workspace';

// The menu wires the panel `⋯` item «이 패널 만든 방법» to the frame, as ConfigurationWorkspace does.
function RecipeWorkspace({ start }: { start: string | null }) {
  const [explained, setExplained] = useState(start);
  const face = (id: string, front: ReactNode) => <PanelRecipeFrame open={explained === id} onClose={() => setExplained(null)}
    back={close => <RecipeBack id={id} close={close} />}>{front}</PanelRecipeFrame>;
  return <PanelWorkspace panels={PANELS(face)} presets={PRESETS} initialPreset="balanced" initialMode="fit" persistKey="storybook.recipe" label={{ ko: '설비 분석', en: 'Equipment analysis' }}
    panelMenuItems={id => [{ id: 'recipe', label: PANEL_RECIPE_ITEM, onSelect: () => setExplained(id) }]} />;
}

/** 패널의 앞면(본문)과 뒷면(만든 방법)을 바꿔 보이는 틀. 안에서 닫으면 포커스를 틀로 돌려준다. 뒷면은 지연 로딩이어도 되고, 그동안 앞면을 보인다. */
const meta = {
  title: '페이지·작업 영역/PanelRecipeFrame',
  component: PanelRecipeFrame,
  decorators: [Story => <div className="flex h-[520px] w-full flex-col"><Story /></div>, workspacePage],
  parameters: { docs: {
    subtitle: '@ap/components · packages/sdk/components/src/panel-recipe/PanelRecipeBack.tsx',
    page: guidedPage([['docs/contract/components.md', 'the menu decides by returning items or an empty list']]),
  } },
  render: () => <RecipeWorkspace start={null} />,
} satisfies Meta<typeof PanelRecipeFrame>;
export default meta;
type Story = StoryObj;

/** 앞면: 패널 `⋯` 끝의 «이 패널 만든 방법»으로 뒤집는다. */
export const Front: Story = {};
/** 뒷면: 기본 패널을 뒤집은 상태. «앞면으로»로 돌아온다. */
export const Back: Story = { render: () => <RecipeWorkspace start="util" /> };
