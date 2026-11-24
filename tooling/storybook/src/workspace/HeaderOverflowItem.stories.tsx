import type { Meta, StoryObj } from '@storybook/react-vite';
import { HeaderOverflowItem } from '@ap/components';
import { guidedPage } from '../guidance';

/** 페이지 머리 `⋯` 메뉴의 항목 한 줄. 막힌 항목은 숨기지 않고 `aria-disabled`로 남겨 Tab이 닿고 이유가 읽힌다. */
const meta = {
  title: '페이지·작업 영역/HeaderOverflowItem',
  component: HeaderOverflowItem,
  args: { label: '분석 보드에 열기…', onSelect: () => undefined },
  decorators: [Story => <div className="w-60 rounded-md border border-border-subtle bg-surface-popover p-1 shadow-md"><Story /></div>],
  parameters: { docs: {
    subtitle: '@ap/components · packages/sdk/components/src/archetypes/HeaderOverflowItem.tsx',
    page: guidedPage([['docs/contract/components.md', '`allowed: false`면 숨기지 않고 비활성 + `reason`을 보인다']]),
  } },
} satisfies Meta<typeof HeaderOverflowItem>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 쓸 수 있는 항목. */
export const Allowed: Story = {};
/** `allowed: false`와 `reason`: 비활성으로 남고 이유를 아래에 적는다. */
export const Blocked: Story = { args: { allowed: false, reason: '분석 보드 권한이 없습니다' } };
