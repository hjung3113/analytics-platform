import type { Meta, StoryObj } from '@storybook/react-vite';
import { ObjectLinks } from '@ap/components';
import { EQUIPMENT } from '../equipment';
import { guidedPage } from '../guidance';
import { platformDecorator } from '../platform';

// Two other menus open an equipment object (`opensObject`); the Kernel lists them, the current menu is never one of them.
const DETAIL = { id: 'equipment-detail', label: { ko: '설비 상세', en: 'Equipment detail' }, path: '/equipment/:equipmentId', opensObject: { equipment: { param: 'equipmentId' } } };
const ALARMS = { id: 'alarm-history', label: { ko: '알람 이력', en: 'Alarm history' }, path: '/alarms', pageKeys: ['eqp'], opensObject: { equipment: { pageKey: 'eqp' } } };

/** 행·서랍 본문의 «다른 화면에서 열기». Kernel `objectLinks` 목록이 0개면 없고, 1개면 목적지 이름 링크, 여러 개면 «다른 화면» 목록이다. */
const meta = {
  title: '페이지·작업 영역/ObjectLinks',
  component: ObjectLinks,
  args: { kind: 'equipment', id: 'EQ-0142' },
  decorators: [Story => <div className="flex w-[560px] items-center justify-between rounded-md border border-border-subtle px-3 py-2 text-sm">
    <span>EQ-0142 · {EQUIPMENT[0]!.process} · 가동 {EQUIPMENT[0]!.util}%</span><Story />
  </div>],
  parameters: { docs: {
    subtitle: '@ap/components · packages/sdk/components/src/archetypes/ObjectLinks.tsx',
    page: guidedPage([['docs/contract/cross-menu-links.md', '본문의 행·서랍은 `ObjectLinks`를 배치한다']]),
  } },
} satisfies Meta<typeof ObjectLinks>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 목적지 하나: 그 메뉴 이름의 한 번 클릭 링크. */
export const One: Story = { decorators: [platformDecorator({ others: [DETAIL] })] };
/** 목적지 둘: «다른 화면» 목록(Enter로 열고 Escape로 닫는다). */
export const Several: Story = { decorators: [platformDecorator({ others: [DETAIL, ALARMS] })] };
