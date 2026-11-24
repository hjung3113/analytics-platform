import type { Meta, StoryObj } from '@storybook/react-vite';
import { Crosshair, List, SlidersHorizontal } from 'lucide-react';
import { userEvent, within } from 'storybook/test';
import { Inspector, type InspectorSection } from '@ap/components';
import { EQUIPMENT, PROCESSES } from '../equipment';
import { guidedPage } from '../guidance';

// Section content gets its data from above (here the synthetic lists); the Inspector never queries.
const body = 'grid gap-1 px-3 py-2 text-sm';
const SECTIONS: InspectorSection[] = [
  { id: 'target', title: { ko: '대상', en: 'Target' }, icon: Crosshair, summary: { ko: '1공장 · 식각', en: 'Fab 1 · Etch' },
    render: () => <div className={body}><span>1공장</span><span className="text-text-secondary">공정: 식각</span></div> },
  { id: 'legend', title: { ko: '범례', en: 'Legend' }, icon: List, summary: { ko: `공정 ${PROCESSES.length}개`, en: `${PROCESSES.length} processes` },
    render: () => <ul className={body}>{PROCESSES.map(p => <li key={p}>{p} <span className="text-text-secondary">· 설비 {EQUIPMENT.filter(e => e.process === p).length}대</span></li>)}</ul> },
  { id: 'options', title: { ko: '옵션', en: 'Options' }, icon: SlidersHorizontal, summary: { ko: '일 단위', en: 'Daily' },
    render: () => <div className={body}><span>집계 단위: 일</span><span>전 기간 비교: 끔</span></div> },
];

/** 분석 화면의 보조 설정(대상·범례·옵션)을 섹션으로 한 번 선언하고 `stack`(아코디언) 또는 `rail`(40px 아이콘 열과 peek)로 보인다. */
const meta = {
  title: '페이지·작업 영역/Inspector',
  component: Inspector,
  args: { sections: SECTIONS, form: 'stack', label: { ko: '분석 설정', en: 'Analysis settings' } },
  argTypes: { sections: { control: false } },
  decorators: [Story => <div className="h-[320px] w-[280px] border border-border-subtle"><Story /></div>],
  parameters: { docs: {
    subtitle: '@ap/components · packages/sdk/components/src/inspector/Inspector.tsx',
    page: guidedPage([['docs/contract/components.md', '여러 섹션을 함께 열 수 있는 것이 기본이다'], ['docs/contract/components.md', '질의는 Inspector 위(메뉴)에 두고 결과를 `render`에 넘긴다']]),
  } },
} satisfies Meta<typeof Inspector>;
export default meta;
type Story = StoryObj<typeof meta>;

/** `stack`: 모두 열린 기본 상태. */
export const Stack: Story = {};
/** `defaultExpanded`로 대상만 열었다. 접힌 섹션은 머리에 `summary`가 남는다. */
export const StackCollapsed: Story = { args: { defaultExpanded: ['target'] } };
/** `rail`: 범례 버튼을 눌러 peek을 연 상태. */
export const Rail: Story = {
  args: { form: 'rail' },
  decorators: [Story => <div className="w-[40px]"><Story /></div>],
  play: async ({ canvasElement }) => { await userEvent.click(within(canvasElement).getByRole('button', { name: '범례' })); },
  parameters: { docs: { story: { inline: false, iframeHeight: 360, autoplay: true } } },
};
