import userEvent from '@testing-library/user-event';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId, type ApiResponse, type PageResult, type TableQuery } from '@ap/contracts';
import { PlatformDataTable, type PlatformColumn } from '../PlatformDataTable';
import { stubCompactTableGeometry } from '../../testing';
import { TABLE_SIZE_KEY, TABLE_SIZE_STEPS } from '../tableSize';

// Node 1217d (06 §15): 표 크기 작게 / 보통 / 크게 — a relative step with variables shared by header, body and the virtualizer's estimate.
type Row = { id: string; line: string; qty: number };
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'export-menu' })],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [{ id: 'export-menu', group: groupId('overview'), primary: true, label: { ko: '내보내기', en: 'Export' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'management', features: { export: true, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});
const session = testSession(['platform:view'], { user: { id: 'user-a' } });
const adapter = testAdapter({ session: () => session });
const axes = [{ id: 'maker', label: { ko: 'Maker', en: 'Maker' }, membershipHistory: false }];
const data: Row[] = [{ id: 'a1', line: 'A', qty: 1 }, { id: 'a2', line: 'B', qty: 2 }];
const columns: PlatformColumn<Row>[] = [{ id: 'line', header: '라인', size: 128 }, { id: 'qty', header: '수량' }];
const ok = (d: PageResult<Row>): ApiResponse<PageResult<Row>> => ({ outcome: 'ok', assessments: [], trust: null, correlationId: 'c', data: d });
const load = async (_q: TableQuery, _s: AbortSignal) => ok({ rows: data, total: data.length });

let toolbarWidth = 1280;
let restoreGeometry: () => void;
beforeEach(() => {
  toolbarWidth = 1280;
  restoreGeometry = stubCompactTableGeometry(220);
  vi.stubGlobal('localStorage', memoryStorage());
  window.history.replaceState(null, '', '/');
  vi.stubGlobal('ResizeObserver', class {
    constructor(private cb: ResizeObserverCallback) {}
    observe(target: Element) { this.cb([{ target, contentRect: { width: target.hasAttribute('data-table-toolbar') ? toolbarWidth : 1280, height: 800 } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
    unobserve() {} disconnect() {}
  });
});
afterEach(() => { cleanup(); restoreGeometry(); });

function Harness() {
  return <I18nProvider><PlatformProvider equipmentAxes={axes} adapter={adapter} registry={registry}>
    <PlatformDataTable<Row> title="설비 목록" ariaLabel="table" columns={columns} getRowId={r => r.id} loadPage={load} filterKey="f" preferenceKey="size-test" pageSize={25} height={300}
      exportRows={async () => ({ outcome: 'ok', assessments: [], trust: null, correlationId: 'c', data })} />
  </PlatformProvider></I18nProvider>;
}
const section = () => document.querySelector('section[aria-label="table"]') as HTMLElement;
const toolbar = () => document.querySelector('[data-table-toolbar]') as HTMLElement;
const header = (id: string) => document.querySelector(`[role=columnheader][data-column=${id}]`) as HTMLElement;
const cell = (id: string) => document.querySelector(`[role=cell][data-column=${id}]`) as HTMLElement;
async function mount() { const view = render(<Harness />); await screen.findByText(/1\/1/); return view; }
async function choose(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(within(toolbar()).getByRole('button', { name: /^표 크기/ }));
  await user.click(await screen.findByRole('menuitemradio', { name }));
}

describe('PlatformDataTable table size (1217d)', () => {
  it('has a 32px 「표 크기: 보통 ▾」 menu that the keyboard operates: Enter opens, arrows move, Enter chooses', async () => {
    const user = userEvent.setup();
    await mount();
    const button = within(toolbar()).getByRole('button', { name: '표 크기: 보통' });
    expect(button).toHaveClass('h-8');
    expect(button.querySelector('.lucide-chevron-down')).not.toBeNull();
    button.focus();
    await user.keyboard('{Enter}');
    const items = await screen.findAllByRole('menuitemradio');
    expect(items.map(i => i.textContent)).toEqual(['작게', '보통', '크게']);
    expect(items[1]).toHaveAttribute('aria-checked', 'true');
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{Enter}');
    expect(within(toolbar()).getByRole('button', { name: '표 크기: 크게' })).toBeTruthy();
    expect(section()).toHaveAttribute('data-table-size', 'large');
  });

  it.each([
    ['small', '작게', 'var(--text-xs)', '11px', '28px'],
    ['normal', '보통', 'var(--text-sm)', '12px', '32px'],
    ['large', '크게', 'calc(var(--text-sm) + 2px)', '14px', '40px'],
  ] as const)('%s sets the font, header font and row height variables (the virtualizer uses the same row height)', async (size, name, font, head, row) => {
    const user = userEvent.setup();
    await mount();
    if (size !== 'normal') await choose(user, name);
    expect(section().style.getPropertyValue('--ap-table-font')).toBe(font);
    expect(section().style.getPropertyValue('--ap-table-head-font')).toBe(head);
    expect(section().style.getPropertyValue('--ap-table-row-h')).toBe(row);
    expect(TABLE_SIZE_STEPS[size].rowDelta + 32).toBe(Number.parseInt(row));
  });

  it('작게 and 크게 are steps off the baseline: the rows and header take the row-height variable, 작게 caps row buttons at 24px but never the checkbox', async () => {
    const user = userEvent.setup();
    await mount();
    await choose(user, '작게');
    expect(cell('line')).toHaveClass('min-h-(--ap-table-row-h)', 'text-(length:--ap-table-font)');
    expect(cell('line').className).toContain('[&_button:not([role=checkbox])]:h-6');
    expect(header('line')).toHaveClass('min-h-(--ap-table-row-h)');
    expect(header('line').style.fontSize).toBe('var(--ap-table-head-font)');
    await choose(user, '크게');
    expect(cell('line').className).not.toContain(':h-6');
    expect(cell('line').className).toContain('[&_.t-mono]:');
    expect(header('qty').style.fontSize).toBe('var(--ap-table-head-font)');
  });

  it.each(['small', 'normal', 'large'] as const)('%s keeps every checkbox 14×14 (size-3.5) in the header and the rows', async size => {
    localStorage.setItem(TABLE_SIZE_KEY, size);
    await mount();
    const boxes = [...section().querySelectorAll('[role=checkbox]')];
    expect(boxes.length).toBe(1 + data.length);
    for (const box of boxes) {
      expect(box).toHaveClass('size-3.5');
      expect(box.className).not.toMatch(/(?:^|\s)(?:h|w|size|min-h)-(?!3\.5(?:\s|$))/);
    }
  });

  it('크게 widens DEFAULT widths by 15/13 and leaves a width the user dragged alone; 작게 keeps the defaults', async () => {
    localStorage.setItem('size-test', JSON.stringify({ sizing: { qty: 210 }, visibility: {}, pinning: { left: [], right: [] }, order: [] }));
    localStorage.setItem(TABLE_SIZE_KEY, 'large');
    const view = await mount();
    expect(header('line').style.width).toBe(`${Math.round(128 * 15 / 13)}px`);
    expect(header('qty').style.width).toBe('210px');
    expect((document.querySelector('[role=columnheader][data-column=_select]') as HTMLElement).style.width).toBe('60px'); // the checkbox column keeps its width in every size
    view.unmount();
    localStorage.setItem(TABLE_SIZE_KEY, 'small');
    await mount();
    expect(header('line').style.width).toBe('128px');
    expect(header('qty').style.width).toBe('210px');
  });

  it('the choice is one per-user setting: stored under the documented key, shared by a second table, and survives a remount', async () => {
    const user = userEvent.setup();
    const view = await mount();
    await choose(user, '크게');
    expect(localStorage.getItem(TABLE_SIZE_KEY)).toBe('large');
    view.unmount();
    await mount();
    expect(section()).toHaveAttribute('data-table-size', 'large');
    expect(within(toolbar()).getByRole('button', { name: '표 크기: 크게' })).toBeTruthy();
    await choose(user, '보통');
    expect(localStorage.getItem(TABLE_SIZE_KEY)).toBeNull();
  });

  it('two tables on one page change together', async () => {
    const user = userEvent.setup();
    render(<><Harness /><Harness /></>);
    await screen.findAllByText(/1\/1/);
    await user.click(within(document.querySelectorAll('[data-table-toolbar]')[0] as HTMLElement).getByRole('button', { name: /^표 크기/ }));
    await user.click(await screen.findByRole('menuitemradio', { name: '작게' }));
    expect([...document.querySelectorAll('section[aria-label="table"]')].map(s => s.getAttribute('data-table-size'))).toEqual(['small', 'small']);
  });

  it('보통 renders exactly today\'s classes: no size variable class, no inline font size', async () => {
    await mount();
    expect(header('line').className.startsWith('flex min-h-8 items-center overflow-hidden whitespace-nowrap px-4 py-1 pointer-coarse:min-h-11')).toBe(true);
    expect(header('line').style.fontSize).toBe('');
    expect(cell('line').className).toBe('flex min-h-8 items-center px-4 py-1 pointer-coarse:min-h-11 overflow-visible whitespace-normal [overflow-wrap:anywhere] border-b border-border-subtle bg-surface-card text-sm group-hover:bg-surface-row-hover group-aria-selected:bg-surface-row-selected');
    expect(cell('line')).toHaveClass('text-sm');
    expect(section().className).not.toContain('ap-table');
    expect(cell('line').className).not.toContain('ap-table');
    expect(header('line').style.width).toBe('128px');
  });

  it('in `⋯` below 470px, right after 그룹 in the collapse order; the submenu changes the size', async () => {
    toolbarWidth = 450;
    const user = userEvent.setup();
    await mount();
    expect(within(toolbar()).queryByRole('button', { name: /^표 크기/ })).toBeNull();
    await user.click(within(toolbar()).getByRole('button', { name: '더보기' }));
    const trigger = await screen.findByRole('menuitem', { name: '표 크기: 보통' });
    trigger.focus();
    await user.keyboard('{ArrowRight}');
    expect((await screen.findAllByRole('menuitemradio')).map(i => i.textContent)).toEqual(['작게', '보통', '크게']);
    await user.keyboard('{Enter}');
    await waitFor(() => expect(section()).toHaveAttribute('data-table-size', 'small'));
    expect(localStorage.getItem(TABLE_SIZE_KEY)).toBe('small');
  });
});
