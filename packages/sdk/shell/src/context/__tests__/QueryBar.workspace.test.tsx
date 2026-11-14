import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { House } from 'lucide-react';
import { groupId, spaceId } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry, useQueryDraft } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { PanelWorkspace, PageFilterBar, PlatformPage, StatCard, type PlatformPageProps } from '@ap/components';
import { GlobalContextBar } from '../GlobalContextBar';

const period = '?from=2026-09-25T09:00:00&to=2026-09-26T09:00:00';
const summary = [{ key: 'grain', label: '집계', value: '시간' }];
const features = { export: false, savedView: false, annotate: false, compare: false };
let draft: ReturnType<typeof useQueryDraft>;
function Parameters() {
  draft = useQueryDraft();
  const [text, setText] = useState('시간');
  return <PageFilterBar collapsible defaultCollapsed preferenceKey="parameters" label="페이지 필터" fields={[{ key: 'grain', kind: 'text', label: '집계', value: text, onValueChange: value => { setText(value); draft.setDraftPage({ grain: value }); } }]} summaryItems={summary} />;
}
function Workspace() {
  return <PanelWorkspace persistKey="main" initialPreset="default" label={{ ko: '작업 영역', en: 'Workspace' }} initialMode="fit"
    presets={[
      { id: 'default', label: { ko: '기본', en: 'Default' }, layout: { type: 'group', panels: ['chart', 'stats'] } },
      { id: 'focus', label: { ko: '집중', en: 'Focus' }, layout: { type: 'group', panels: ['stats', 'chart'] } },
    ]} panels={[
      { id: 'chart', primary: true, title: { ko: '차트', en: 'Chart' }, render: () => <p>chart data</p> },
      { id: 'stats', title: { ko: '요약', en: 'Summary' }, render: () => <StatCard icon={House} label="지표" value="12" /> },
    ]} />;
}
const done = { status: 'done', completedAt: 1_800_000_000_000 } as const;
function mount({ result = done, expanded = false, pageType = 'analysis', apply = true, scopeGate = false, issues = false }: { result?: PlatformPageProps['queryResult']; expanded?: boolean; pageType?: 'analysis' | 'overview'; apply?: boolean; scopeGate?: boolean; issues?: boolean } = {}) {
  const registry = createRegistry({ spaces: [testSpace()], groups: [{ id: groupId('overview'), space: spaceId('mars'), label: { ko: '개요', en: 'Overview' }, icon: House }], menus: [{ id: 'home', primary: true, path: '/', group: groupId('overview'), label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, icon: House, permission: 'platform:view', requiresScope: scopeGate, context: { ...noContext, time: 'apply' }, ...(apply ? { query: { mode: 'apply' as const } } : {}), pageType, pageKeys: ['grain'], features }] });
  window.history.replaceState(null, '', `/${period}`);
  localStorage.setItem('platform:query-bar-collapsed:home', String(!expanded));
  const session = testSession(['platform:view']);
  return render(<I18nProvider><PlatformProvider registry={registry} adapter={testAdapter({ session: () => session })} slots={{ contextBar: <GlobalContextBar /> }}>
    <PlatformPage layout="fill" contextExtension={<Parameters />} contextNotes={['첫 안내', '둘째 안내']} queryBarExtension={{ pageSummary: summary, appliedPageSummary: summary, issues: issues ? [{ key: 'grain', label: '집계', reason: '잘못된 집계' }] : [] }} queryResult={result}><Workspace /></PlatformPage>
  </PlatformProvider></I18nProvider>);
}
beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  vi.stubGlobal('ResizeObserver', class {
    constructor(private callback: ResizeObserverCallback) {}
    observe(target: Element) { this.callback([{ target, contentRect: { width: 1000, height: 600, top: 0, left: 0, right: 1000, bottom: 600, x: 0, y: 0 } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
    unobserve() {}
    disconnect() {}
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('folded apply Analysis Workspace places status, parameters and the real toolbar in a fixed second query-bar line (#1941)', async () => {
  mount();
  const bar = screen.getByRole('region', { name: '조회 조건' });
  const chip = await within(bar).findByRole('button', { name: /페이지 조건/ });
  const toolbar = within(bar).getByRole('toolbar', { name: '배치' });
  const row = bar.querySelector('[data-workspace-query-row]')!;
  expect(row.parentElement).toBe(bar);
  expect(row).toHaveClass('px-4', 'pb-2');
  expect(row).not.toHaveClass('flex-wrap');
  expect(row).toContainElement(chip);
  expect(row).toContainElement(toolbar);
  expect(within(row as HTMLElement).getByRole('status')).toHaveTextContent('요약 조회 완료');
  expect(chip).toHaveTextContent('안내 2');
  expect(chip).toHaveClass('max-w-80', 'break-keep');
  expect(within(bar).getByText('화면 배치')).toBeVisible();
  expect(bar.querySelector('[data-workspace-toolbar-slot]')).toHaveClass('ml-auto');
  expect(screen.queryByRole('region', { name: '적용된 조회 조건' })).toBeNull();
  expect(document.querySelector('[data-page-head]')).toBeNull();
  expect(document.querySelector('[data-panel-workspace] [data-workspace-toolbar]')).toBeNull();
  await userEvent.click(await screen.findByRole('tab', { name: '요약' }));
  expect(screen.getByText('지표').closest('div')).not.toHaveClass('border');
  expect(screen.getByRole('button', { name: '조회 조건 펼치기' }).parentElement).toHaveClass('min-h-12', 'items-center', 'gap-2', 'px-4');
  await userEvent.click(within(toolbar).getByRole('radio', { name: '집중' }));
  expect(within(toolbar).getByRole('radio', { name: '집중' })).toHaveAttribute('aria-checked', 'true');
  await userEvent.click(chip);
  const editor = await screen.findByRole('dialog');
  expect(within(editor).getByRole('textbox', { name: '집계' })).toBeVisible();
  expect(editor).toHaveTextContent('첫 안내');
  expect(editor).toHaveTextContent('둘째 안내');
  expect(within(editor).queryByRole('button', { name: '페이지 필터 펼치기' })).toBeNull();
  expect(within(editor).queryByRole('button', { name: '페이지 필터 접기' })).toBeNull();
  fireEvent.change(within(editor).getByRole('textbox', { name: '집계' }), { target: { value: '일' } });
  expect(new Map(draft.draft.page).get('grain')).toBe('일');
  await userEvent.keyboard('{Escape}');
  expect(chip).toHaveFocus();
  expect(chip).toHaveTextContent('미적용 변경 있음');
  await userEvent.click(chip);
  expect(within(await screen.findByRole('dialog')).getByRole('textbox', { name: '집계' })).toHaveValue('일');
  await userEvent.keyboard('{Escape}');
  await userEvent.click(screen.getByRole('button', { name: '조회 조건 펼치기' }));
  expect(document.querySelector('[data-workspace-query-row]')).toBeNull();
  expect(screen.getByRole('region', { name: '적용된 조회 조건' })).toHaveTextContent('요약 조회 완료');
  expect(document.querySelector('[data-page-head]')).not.toBeNull();
  expect(document.querySelector('[data-panel-workspace] [data-workspace-toolbar]')).not.toBeNull();
  await userEvent.click(screen.getByRole('button', { name: '페이지 머리 펼치기' }));
  await userEvent.click(screen.getByRole('button', { name: '페이지 필터 펼치기' }));
  expect(screen.getByRole('textbox', { name: '집계' })).toHaveValue('일');
});


it.each([
  ['loading', null, false, '불러오는 중'],
  ['refreshing', 1_800_000_000_000, false, '갱신 중'],
  ['done', 1_800_000_000_000, true, '데이터를 불러오지 못했습니다'],
] as const)('folded summary status %s is visible in the query region', async (status, completedAt, failed, wording) => {
  mount({ result: { status, completedAt, failed } });
  const bar = screen.getByRole('region', { name: '조회 조건' });
  await within(bar).findByRole('button', { name: /페이지 조건/ });
  const result = within(bar).getAllByRole('status').find(node => node.textContent?.includes(wording));
  expect(result).toBeTruthy();
  if (completedAt !== null) expect(result!.textContent).toMatch(/27\. 1\. 15\./);
  expect(screen.queryByRole('region', { name: '적용된 조회 조건' })).toBeNull();
});

it.each([
  ['expanded', { expanded: true }],
  ['Overview', { pageType: 'overview' as const }],
  ['live', { apply: false }],
  ['Scope gate', { scopeGate: true }],
])('%s keeps the existing page presentation', async (_name, options) => {
  mount(options);
  await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument());
  expect(document.querySelector('[data-workspace-query-row]')).toBeNull();
  expect(screen.queryByRole('button', { name: /페이지 조건/ })).toBeNull();
  if (_name !== 'Scope gate') {
    expect(document.querySelector('[data-page-head]')).not.toBeNull();
    expect(document.querySelector('[data-panel-workspace] [data-workspace-toolbar]')).not.toBeNull();
    await userEvent.click(await screen.findByRole('tab', { name: '요약' }));
    expect(screen.getByText('지표').closest('div')).toHaveClass('border');
  }
});

it('keeps notes, pending and issue counts outside the truncated summary (#1941)', async () => {
  mount({ issues: true });
  const chip = await screen.findByRole('button', { name: /^페이지 조건/ });
  await userEvent.click(chip);
  fireEvent.change(within(await screen.findByRole('dialog')).getByRole('textbox', { name: '집계' }), { target: { value: '일' } });
  await userEvent.keyboard('{Escape}');
  const summaryText = chip.querySelector('.truncate');
  expect(summaryText).toHaveTextContent('집계 시간');
  for (const selector of ['[data-page-head-notes]', '[data-page-head-pending]', '[data-page-head-issues]']) {
    const count = chip.querySelector(selector);
    expect(count).toHaveClass('shrink-0', 'whitespace-nowrap');
    expect(summaryText).not.toContainElement(count as HTMLElement);
  }
  expect(chip.querySelector('[data-page-head-issues]')).toHaveTextContent('1');
});
