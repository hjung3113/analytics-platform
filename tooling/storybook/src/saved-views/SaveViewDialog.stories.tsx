import type { Meta, StoryObj } from '@storybook/react-vite';
import { SaveViewDialog } from '@ap/components';
import { guidedPage } from '../guidance';
import { ok } from './views';

const VISIBILITY = [{ value: 'private', label: '나만' }, { value: 'group:g-etch', label: '식각 분석 그룹' }];

/** 적용한 조건을 새 뷰로 저장하거나 현재 뷰에 덮어쓰는 대화창. 저장 단위(조건 세트·메뉴 뷰)와 공개 대상은 마지막 «저장»에서만 정해진다. */
const meta = {
  title: '저장된 뷰/SaveViewDialog',
  component: SaveViewDialog,
  args: {
    open: true, onOpenChange: () => undefined, units: ['condition-set', 'menu-view'], initialName: '식각 일 가동률 (복사본)',
    context: { relativePeriod: { hours: 168 }, lineNames: ['L1', 'L2'] }, visibilityOptions: VISIBILITY, onSubmit: () => ok(null),
  },
  argTypes: { onSubmit: { control: false }, context: { control: false } },
  parameters: { docs: {
    subtitle: '@ap/components · packages/sdk/components/src/saved-view/SaveViewDialog.tsx',
    page: guidedPage([['docs/contract/kernel.md', '하는 것이 기본이며 초안이 있으면 적용 뒤 저장하도록 안내한다']]),
    story: { inline: false, iframeHeight: 620 },
  } },
} satisfies Meta<typeof SaveViewDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 새 뷰: 단위와 공개 대상을 고른다. */
export const New: Story = {};
/** 현재 뷰에 저장(`updatable`)할 수 있고, 미적용 초안과 패널 요약이 있는 경우. */
export const UpdateWithDraft: Story = { args: { updatable: { name: '식각 일 가동률', unit: 'menu-view' }, initialMode: 'update', hasDraft: true, panels: { count: 2, excluded: ['차트 확대 구간'] } } };
