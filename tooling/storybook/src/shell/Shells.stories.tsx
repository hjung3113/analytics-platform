import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, ListShell, ListTabs, PageShell, WorkbenchShell } from '@ap/ui';
import { EQUIPMENT, PROCESSES } from '../equipment';
import { guidedPage } from '../guidance';

// A shell is the flex child of the app frame's <main>; this box stands in for it.
const frame = (Story: () => ReactNode) => <div className="flex h-[360px] flex-col border border-border-subtle"><Story /></div>;
const rows = <ul className="divide-y divide-border-subtle text-sm">{EQUIPMENT.map(e =>
  <li key={e.id} className="flex justify-between px-4 py-3"><span className="t-mono">{e.id}</span><span>{e.process} · {e.util.toFixed(1)}%</span></li>)}</ul>;

/**
 * 메뉴 화면을 담는 세 셸(Props 표는 `PageShell`). 기본은 전체 페이지 `PageShell`: 50px 머리와 스크롤 본문. 본문은 패딩(위 28 · 좌우 32 · 아래 36px)을 두고 `fluid`가 아니면 1600px에서 멈춘다.
 * `detailPanel`은 셸 오른쪽 상세 슬롯으로 넘긴다(슬롯이 없으면 아무 일도 하지 않는다).
 */
const meta = {
  title: '셸·패널/셸',
  component: PageShell,
  args: { header: { title: '설비 현황', actions: <Button size="toolbar" variant="secondary">내보내기</Button> }, children: null },
  argTypes: { children: { control: false }, detailPanel: { control: false } },
  decorators: [frame],
  render: args => <PageShell {...args}><p className="text-sm text-text-secondary">공정 {PROCESSES.length}개, 설비 {EQUIPMENT.length}대의 최근 7일 가동 현황.</p></PageShell>,
  parameters: {
    docs: {
      subtitle: '@ap/ui · packages/sdk/ui/src/layout/PageShell.tsx · ListShell.tsx · WorkbenchShell.tsx',
      page: guidedPage([['docs/contract/layout.md', '기능 PageShell 기준']]),
    },
  },
} satisfies Meta<typeof PageShell>;
export default meta;
type Story = StoryObj;

/** 페이지 셸. */
export const Page: Story = {};

/** `ListShell`: 50px 툴바, 탭 띠, 목록. 목록 스크롤은 셸의 본문 칸이 맡는다. */
export const List: Story = {
  render: () => <ListShell toolbar={{ title: '설비 목록', actions: <Button size="toolbar" variant="secondary">설비 추가</Button> }}
    tabs={<ListTabs ariaLabel="설비 구분" tabs={[{ value: 'all', label: '전체', badgeCount: 8 }, { value: 'alarm', label: '알람 있음', badgeCount: 7 }]} />}
    list={rows} />,
};

/** `WorkbenchShell`: 단순 목록이 아닌 작업면(분류 대기열, 보드). */
export const Workbench: Story = {
  render: () => <WorkbenchShell toolbar={{ title: '알람 분류', actions: <Button size="toolbar">일괄 확인</Button> }}>
    <div className="grid h-full grid-cols-3 gap-3 p-4">{PROCESSES.map(p => <section key={p} className="rounded-md border border-border-subtle bg-surface-card p-3">
      <h3 className="t-card-title mb-2">{p}</h3><p className="text-sm text-text-secondary">미분류 {EQUIPMENT.filter(e => e.process === p).reduce((n, e) => n + e.alarms, 0)}건</p>
    </section>)}</div>
  </WorkbenchShell>,
};
