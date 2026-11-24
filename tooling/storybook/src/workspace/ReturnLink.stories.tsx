import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReturnLink } from '@ap/components';
import { guidedPage } from '../guidance';
import { platformDecorator } from '../platform';
import { DRILL } from './drill';

// The user came from 생산성 개요 at its 1공장 › 식각 step: the address carries that origin in `returnTo` (kernel §6.4).
const ORIGIN = { id: 'overview', label: { ko: '생산성 개요', en: 'Productivity overview' }, path: '/overview', ...DRILL };
const from = `/?returnTo=${encodeURIComponent(encodeURI('/overview?drillFab=1공장&drillProcess=식각'))}`;

/** 다른 메뉴에서 넘어온 화면의 복귀 버튼. Kernel이 채택한 `returnTo`에서 출발 메뉴 이름과 드릴 단계 값을 읽는다. */
const meta = {
  title: '페이지·작업 영역/ReturnLink',
  component: ReturnLink,
  decorators: [platformDecorator({ address: from, menu: DRILL, others: [ORIGIN] })],
  parameters: { docs: {
    subtitle: '@ap/components · packages/sdk/components/src/archetypes/DrillLayout.tsx',
    page: guidedPage([['docs/contract/cross-menu-links.md', '본문 복귀 줄을 그리는 `PlatformPage` 안에서는 공통 `ReturnLink`를 숨겨 같은 링크가 한 번만 보인다']]),
  } },
} satisfies Meta<typeof ReturnLink>;
export default meta;
type Story = StoryObj<typeof meta>;

/** `← 생산성 개요 (1공장 › 식각)`: 누르면 단계 키를 포함한 출발 URL로 돌아간다. */
export const FromOverview: Story = {};
