import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry, useQueryDraft } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId } from '@ap/contracts';
import { PlatformPage, type PlatformPageProps } from '../PlatformPage';

const features = { export: false, savedView: false, annotate: false, compare: false };
const registry = createRegistry({
  spaces: [testSpace()],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: { ...noContext, time: 'apply', roomNames: 'apply' }, query: { mode: 'apply' }, features, pageType: 'analysis', pageKeys: ['sort'] }],
});
const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session });
const KEY = 'platform:page-head-collapsed:home';
const applied = [{ key: 'bucket', label: '버킷', value: '09:00 → 10:00' }];
const draftOnly = [{ key: 'bucket', label: '버킷', value: '초안 값' }];

function Edits() {
  const draft = useQueryDraft();
  return <>
    <button onClick={() => draft.setDraftPage({ sort: 'delta:desc' })}>edit page</button>
    <button onClick={() => draft.setDraftGlobal({ roomNames: ['PHOTO'] })}>edit global</button>
  </>;
}
const tree = (props: Partial<PlatformPageProps> = {}) => <I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
  <Edits />
  <PlatformPage layout="fill" contextExtension={<input aria-label="필터 입력" />} {...props}><p>본문</p></PlatformPage>
</PlatformProvider></I18nProvider>;
const mount = (props: Partial<PlatformPageProps> = {}) => render(tree(props));
const head = () => document.querySelector<HTMLElement>('[data-page-head]')!;

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); window.history.replaceState(null, '', '/'); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('PlatformPage fill head disclosure (#680)', () => {
  it('starts collapsed: the expand button points at the mounted, hidden head content and the extension keeps its state', () => {
    mount();
    const expand = screen.getByRole('button', { name: '페이지 머리 펼치기' });
    expect(expand).toHaveTextContent('펼치기');
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    const content = document.getElementById(expand.getAttribute('aria-controls')!)!;
    expect(content).toHaveAttribute('hidden');
    expect(within(content).getByLabelText('필터 입력', { selector: 'input' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: '필터 입력' })).toBeNull();
  });

  it('toggles, remembers per menu as boolean JSON, moves focus to the opposite toggle and restores on remount', () => {
    const view = mount();
    fireEvent.click(screen.getByRole('button', { name: '페이지 머리 펼치기' }));
    const collapse = screen.getByRole('button', { name: '페이지 머리 접기' });
    expect(collapse).toHaveTextContent('접기');
    expect(collapse).toHaveAttribute('aria-expanded', 'true');
    expect(collapse).toHaveFocus();
    expect(localStorage.getItem(KEY)).toBe('false');
    view.unmount();
    mount();
    expect(screen.getByRole('textbox', { name: '필터 입력' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '페이지 머리 접기' }));
    expect(screen.getByRole('button', { name: '페이지 머리 펼치기' })).toHaveFocus();
    expect(localStorage.getItem(KEY)).toBe('true');
  });

  it.each<[string, Partial<PlatformPageProps>]>([['no extension and no notes', { contextExtension: undefined }], ['only empty notes', { contextExtension: undefined, contextNotes: [null, false] }]])('%s: renders no disclosure and no empty line', (_name, props) => {
    mount(props);
    expect(document.querySelector('[data-page-head]')).toBeNull();
    expect(screen.queryByRole('button', { name: /페이지 머리/ })).toBeNull();
  });

  it('flow page: no disclosure, notes sit above the always-visible extension', () => {
    mount({ layout: 'flow', contextNotes: [<p key="a">안내 문장</p>] });
    expect(screen.queryByRole('button', { name: /페이지 머리/ })).toBeNull();
    const note = screen.getByText('안내 문장');
    const input = screen.getByRole('textbox', { name: '필터 입력' });
    expect(input).toBeVisible();
    expect(note.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.querySelector('[data-outcome-compact]')).toBeNull();
  });

  it('shows the applied summary chips on the collapsed line, never the draft one; pageSummary only when no applied summary exists', () => {
    const view = mount({ queryBarExtension: { pageSummary: draftOnly, appliedPageSummary: applied, issues: [] } });
    const line = head().querySelector<HTMLElement>('[data-page-head-line]')!;
    expect(line).toHaveTextContent('버킷 09:00 → 10:00');
    expect(line).not.toHaveTextContent('초안 값');
    view.unmount();
    mount({ queryBarExtension: { pageSummary: draftOnly, issues: [] } });
    expect(head().querySelector('[data-page-head-line]')).toHaveTextContent('초안 값');
  });

  it('describes the expand button by the full summary (title) and keeps markers and the button from shrinking at 340 px', () => {
    mount({ contextNotes: [<p key="a">안내</p>], queryBarExtension: { pageSummary: applied, appliedPageSummary: applied, issues: [] } });
    const expand = screen.getByRole('button', { name: '페이지 머리 펼치기' });
    const summary = document.getElementById(expand.getAttribute('aria-describedby')!)!;
    expect(summary).toHaveAttribute('title', '버킷 09:00 → 10:00');
    expect(summary).toHaveClass('min-w-0', 'flex-1', 'overflow-x-auto');
    const line = head().querySelector<HTMLElement>('[data-page-head-line]')!;
    (line.parentElement as HTMLElement).style.width = '340px';
    for (const el of [expand, line.querySelector<HTMLElement>('[data-page-head-notes]')!]) expect(el).toHaveClass('shrink-0');
    expect(line.querySelector('[data-page-head-notes]')).toHaveTextContent('안내 1');
  });

  it('wraps each note in its own block container and drops null/false', () => {
    mount({ layout: 'flow', contextNotes: ['First note', null, 'Second note', false] });
    const containers = document.querySelectorAll('[data-page-notes] > div');
    expect(containers).toHaveLength(2);
    expect(containers[0]).toHaveTextContent('First note');
    expect(containers[1]).toHaveTextContent('Second note');
  });

  it('hides the chip scrollbar and shows the right fade only while the list overflows', () => {
    const size = (scroll: number, client: number) => {
      vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(scroll);
      vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(client);
    };
    size(100, 300);
    const view = mount({ queryBarExtension: { pageSummary: applied, appliedPageSummary: applied, issues: [] } });
    const list = document.getElementById(screen.getByRole('button', { name: '페이지 머리 펼치기' }).getAttribute('aria-describedby')!)!;
    expect(list).toHaveClass('[scrollbar-width:none]', '[&::-webkit-scrollbar]:hidden');
    expect(document.querySelector('[data-page-head-fade]')).toBeNull();
    view.unmount();
    size(500, 300);
    mount({ queryBarExtension: { pageSummary: applied, appliedPageSummary: applied, issues: [] } });
    expect(document.querySelector('[data-page-head-fade]')).not.toBeNull();
    vi.restoreAllMocks();
  });

  it('counts notes without the null/false elements', () => {
    mount({ contextNotes: [<p key="a">하나</p>, null, false, <p key="b">둘</p>] });
    expect(head().querySelector('[data-page-head-notes]')).toHaveTextContent('안내 2');
    fireEvent.click(screen.getByRole('button', { name: '페이지 머리 펼치기' }));
    expect(screen.getByText('하나')).toBeVisible();
    expect(screen.getByText('둘')).toBeVisible();
  });

  it('marks pending page-key changes on the collapsed line, but not a global-only change (the query bar owns it)', () => {
    mount();
    expect(head().querySelector('[data-page-head-pending]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'edit global' }));
    expect(head().querySelector('[data-page-head-pending]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'edit page' }));
    expect(head().querySelector('[data-page-head-pending]')).toHaveTextContent('미적용 변경 있음');
  });

  it('shows 확인 필요 N and mounts expanded without overwriting the stored value', () => {
    localStorage.setItem(KEY, 'true');
    const view = mount({ queryBarExtension: { pageSummary: [], issues: [{ key: 'granularity', label: '집계', reason: 'zzz' }] } });
    expect(screen.getByRole('button', { name: '페이지 머리 접기' })).toBeVisible();
    expect(localStorage.getItem(KEY)).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: '페이지 머리 접기' }));
    expect(head().querySelector('[data-page-head-issues]')).toHaveTextContent('확인 필요 1');
    view.unmount();
    // No issue: the stored value rules again.
    mount();
    expect(screen.getByRole('button', { name: '페이지 머리 펼치기' })).toBeInTheDocument();
  });

  it('announces a summary change once while collapsed, and nothing on a toggle', () => {
    const view = mount({ queryBarExtension: { pageSummary: applied, appliedPageSummary: applied, issues: [] } });
    const live = () => head().querySelector('[aria-live="polite"]')!;
    expect(live()).toHaveTextContent('');
    fireEvent.click(screen.getByRole('button', { name: '페이지 머리 펼치기' }));
    expect(live()).toHaveTextContent('');
    fireEvent.click(screen.getByRole('button', { name: '페이지 머리 접기' }));
    expect(live()).toHaveTextContent('');
    const next = [{ key: 'bucket', label: '버킷', value: '10:00 → 11:00' }];
    act(() => { view.rerender(tree({ queryBarExtension: { pageSummary: next, appliedPageSummary: next, issues: [] } })); });
    expect(live()).toHaveTextContent('버킷 10:00 → 11:00');
    expect(live().textContent).toBe('버킷 10:00 → 11:00');
  });
});
