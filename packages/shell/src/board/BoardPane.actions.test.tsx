import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseQuery } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry, usePlatform } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { DetailDrawer, PlatformPage } from '@ap/components';
import { AppShell } from '../AppShell';
import { RouteOutlet } from '../RouteOutlet';
import type { Board, Sheet } from './boardModel';

const features = { export: false, savedView: false, annotate: false, compare: false, board: true };
const apply = { ...noContext, time: 'apply' as const, roomNames: 'apply' as const, lot: 'apply' as const };
const entry = (id: string, path: string, over: Record<string, unknown> = {}) => ({
  id, group: 'equipment' as const, label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House, permission: 'platform:view' as const,
  requiresScope: false, context: apply, pageType: 'analysis' as const, features, pageKeys: ['tab', 'page'], contextResetKeys: ['page'], ...over,
});
function Body() {
  const { pageParam, navigate } = usePlatform();
  return <PlatformPage>
    <p data-testid="tab">{pageParam('tab') ?? 'no-tab'}</p>
    <button type="button" onClick={() => navigate('/beta')}>go beta</button>
    <button type="button" onClick={() => navigate('/beta', { replace: true })}>replace beta</button>
  </PlatformPage>;
}
function DrawerBody() {
  const [open, setOpen] = useState(true);
  return <PlatformPage>
    <p>drawer pane</p>
    {open && <DetailDrawer title="상세 제목" onClose={() => setOpen(false)} tabs={[{ id: 'a', label: '속성', content: <p>속성 내용</p> }]} />}
  </PlatformPage>;
}
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'home' })],
  groups: [{ id: 'equipment', label: { ko: '그룹', en: 'Group' }, icon: House, space: 'analytics' }],
  menus: [
    { ...entry('home', '/', { component: Body, features: { ...features, board: false } }), primary: true },
    entry('alpha', '/alpha', { component: Body, label: { ko: '알파', en: 'Alpha' } }),
    entry('beta', '/beta', { component: Body, label: { ko: '베타', en: 'Beta' } }),
    entry('drawer', '/drawer', { component: DrawerBody, label: { ko: '서랍', en: 'Drawer' } }),
    entry('locked', '/locked', { component: Body, permission: 'console:access', label: { ko: '잠김', en: 'Locked' } }),
  ],
});

const sheet = (id: string, over: Partial<Sheet> = {}): Sheet => ({ id, name: id, layout: '1x1', selected: 0, panes: [null], ...over });
const boardOf = (sheets: Sheet[], active = sheets[0].id): Board => ({ v: 1, activeSheetId: active, sheets });
const pane = (query: string, menuId = 'alpha') => ({ menuId, params: {}, query });
const KEY = 'platform:board:u1';
const stored = (): Board => JSON.parse(localStorage.getItem(KEY)!) as Board;
const seed = (board: Board) => localStorage.setItem(KEY, JSON.stringify(board));
const w1 = 'from=2026-09-01T00:00:00&to=2026-09-02T00:00:00';
const w2 = 'from=2026-08-01T00:00:00&to=2026-08-02T00:00:00';
const ctx = (query: string) => parseQuery(query, ['tab', 'page']);

function mount(url = '/board?sheet=a', permissions: ('platform:view' | 'console:access')[] = ['platform:view']) {
  window.history.replaceState(null, '', url);
  const session = testSession(permissions);
  return render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}><RouteOutlet /></PlatformProvider></I18nProvider>);
}
const openMenu = (trigger: HTMLElement) => { act(() => { trigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 })); }); };
const settle = () => act(() => new Promise(resolve => setTimeout(resolve, 30)));
const paneGroup = (n: number) => screen.getByRole('group', { name: `칸 ${n}` });
const openActions = async (n: number) => { openMenu(within(paneGroup(n)).getByRole('button', { name: `칸 ${n} 동작` })); await settle(); };
const item = (name: string | RegExp) => screen.findByRole('menuitem', { name });

beforeEach(() => {
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    vi.stubGlobal(name, memoryStorage());
  }
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('pane header signals (ADR-0051)', () => {
  const two = () => seed(boardOf([sheet('a', { layout: '1x2', panes: [pane(`?scopeId=S1&${w1}`), pane(`?scopeId=S1&${w2}`)] })]));

  it('squeezes the menu name so the differing room remains visible at the measured 374px head width', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [pane(`?scopeId=S1&${w1}&lotIds=L1&roomNames=PHOTO`), pane(`?scopeId=S1&${w1}&lotIds=L1&roomNames=ETCH`)] })]));
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const width = this.hasAttribute('data-pane-head') ? 374
        : this.dataset.headFixed === 'actions' ? 32
          : this.hasAttribute('data-head-fixed') ? 81
            : this.dataset.chipMeasure === 'chip' ? 107
              : this.dataset.chipMeasure === 'same' ? 50
                : this.dataset.chipMeasure === 'more' ? 27 : 0;
      return { width, height: 0, top: 0, left: 0, right: width, bottom: 0, x: 0, y: 0, toJSON: () => ({}) };
    });
    mount();
    await settle();
    const header = paneGroup(1).querySelector<HTMLElement>('[data-pane-head]')!;
    expect(header.querySelector('[data-pane-chip="roomNames"]')).toHaveTextContent('room_name PHOTO');
    expect(within(header).getByRole('button', { name: '칸 1의 조건 3개 더 보기' })).toHaveTextContent('+3');
    expect(within(header).queryByRole('button', { name: /같은 조건/ })).toBeNull();
    expect(within(header).getByRole('button', { name: '칸 1 동작' })).toBeVisible();
    expect(within(header).getByText('알파')).toHaveClass('min-w-16', 'truncate');
    expect(within(header).getByText('알파')).not.toHaveClass('min-w-24');
  });

  it.each([
    { headWidth: 600, otherRoom: 'ETCH', differing: true },
    { headWidth: 374, otherRoom: 'PHOTO', differing: false },
  ])('keeps the 96px menu minimum at $headWidth px when overflow is absent (differing: $differing)', async ({ headWidth, otherRoom, differing }) => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [pane(`?scopeId=S1&${w1}&lotIds=L1&roomNames=PHOTO`), pane(`?scopeId=S1&${w1}&lotIds=L1&roomNames=${otherRoom}`)] })]));
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const width = this.hasAttribute('data-pane-head') ? headWidth
        : this.dataset.headFixed === 'actions' ? 32
          : this.hasAttribute('data-head-fixed') ? 81
            : this.dataset.chipMeasure === 'chip' ? 107
              : this.dataset.chipMeasure === 'same' ? 50
                : this.dataset.chipMeasure === 'more' ? 27 : 0;
      return { width, height: 0, top: 0, left: 0, right: width, bottom: 0, x: 0, y: 0, toJSON: () => ({}) };
    });
    mount();
    await settle();
    const header = paneGroup(1).querySelector<HTMLElement>('[data-pane-head]')!;
    expect(within(header).getByText('알파')).toHaveClass('min-w-24', 'truncate');
    expect(within(header).getByText('알파')).not.toHaveClass('min-w-16');
    expect(header.querySelectorAll('[data-pane-chip]')).toHaveLength(differing ? 1 : 0);
    expect(within(header).queryByRole('button', { name: /더 보기/ })).toBeNull();
    expect(within(header).getByRole('button', { name: `칸 1의 같은 조건 ${differing ? 3 : 4}개` })).toBeVisible();
    expect(within(header).getByRole('button', { name: '칸 1 동작' })).toBeVisible();
  });

  it('shows a chip only for a key that differs from another content pane, and 같음 N for the rest', async () => {
    two();
    mount();
    await settle();
    const head = within(paneGroup(1));
    expect(paneGroup(1).querySelectorAll('[data-pane-chip]')).toHaveLength(1);
    expect(paneGroup(1).querySelector('[data-pane-chip="time"]')).toHaveTextContent('기간 2026-09-01 00:00 ~ 2026-09-02 00:00');
    expect(paneGroup(1).querySelector('[data-pane-chip="scope"]')).toBeNull();
    expect(head.getByRole('button', { name: '칸 1의 같은 조건 1개' })).toHaveTextContent('같음 1');
    expect(within(paneGroup(2)).getByRole('button', { name: '칸 2의 같은 조건 1개' })).toBeInTheDocument();
    // Order in the head: badge, system chip, name, chips, 같음, ⋯.
    const order = Array.from(paneGroup(1).querySelectorAll('[data-pane-head] button, [data-pane-head] [data-pane-chip]')).map(el => el.getAttribute('aria-label') ?? el.getAttribute('data-pane-chip'));
    expect(order).toEqual(['칸 1 선택', 'time', '칸 1의 같은 조건 1개', '칸 1 접기', '칸 1 최대화', '칸 1 동작']);
  });

  it('keeps two differing chips and 같음 N when both differing chips fit', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [pane('?scopeId=S1&' + w1 + '&roomNames=R1'), pane('?scopeId=S1&' + w2 + '&roomNames=R2')] })]));
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const width = this.hasAttribute('data-pane-head') ? 600
        : this.dataset.headFixed === 'actions' ? 32
          : this.hasAttribute('data-head-fixed') ? 100
            : this.dataset.chipMeasure === 'chip' ? 120
              : this.dataset.chipMeasure === 'more' ? 44 : 0;
      return { width, height: 0, top: 0, left: 0, right: width, bottom: 0, x: 0, y: 0, toJSON: () => ({}) };
    });
    mount();
    await settle();
    expect(paneGroup(1).querySelectorAll('[data-pane-head] [data-pane-chip]:not([data-pane-chip="more"])')).toHaveLength(2);
    expect(within(paneGroup(1)).queryByRole('button', { name: /더 보기/ })).toBeNull();
    expect(within(paneGroup(1)).getByRole('button', { name: '칸 1의 같은 조건 1개' })).toHaveTextContent('같음 1');
  });

  it.each([
    { width: 512, shown: 1, hidden: 2 },
    { width: 560, shown: 2, hidden: 1 },
    { width: 567, shown: 2, hidden: 1 },
    { width: 568, shown: 2, hidden: 0 },
    { width: 600, shown: 2, hidden: 0 },
  ])('fits the complete header at $width px, preserving actions and folding same conditions only as needed', async ({ width: headWidth, shown, hidden }) => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [pane('?scopeId=S1&' + w1 + '&roomNames=R1'), pane('?scopeId=S1&' + w2 + '&roomNames=R2')] })]));
    // Full row: 16 padding + 100 badge/system + 96 menu + 244 chips + 48 summary + 32 actions + 32 gaps = 568.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const width = this.hasAttribute('data-pane-head') ? headWidth
        : this.dataset.headFixed === 'actions' ? 32
          : this.hasAttribute('data-head-fixed') ? 100
            : this.dataset.chipMeasure === 'chip' ? 120
              : this.dataset.chipMeasure === 'same' ? 48
                : this.dataset.chipMeasure === 'more' ? 44 : 0;
      return { width, height: 0, top: 0, left: 0, right: width, bottom: 0, x: 0, y: 0, toJSON: () => ({}) };
    });
    mount();
    await settle();
    const header = paneGroup(1).querySelector<HTMLElement>('[data-pane-head]')!;
    expect(header.querySelectorAll('[data-pane-chip]:not([data-pane-chip="more"])')).toHaveLength(shown);
    expect(within(header).getByRole('button', { name: '칸 1 동작' })).toBeVisible();
    if (hidden > 0) {
      expect(within(header).queryByRole('button', { name: /같은 조건/ })).toBeNull();
      expect(within(header).getByRole('button', { name: `칸 1의 조건 ${hidden}개 더 보기` })).toHaveTextContent(`+${hidden}`);
    } else {
      expect(within(header).getByRole('button', { name: '칸 1의 같은 조건 1개' })).toHaveTextContent('같음 1');
      expect(within(header).queryByRole('button', { name: /더 보기/ })).toBeNull();
    }
  });

  it('folds 같음 into +N when differing chips do not all fit, and the popover still lists every condition', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [pane('?scopeId=S1&' + w1 + '&roomNames=R1&lotIds=L1'), pane('?scopeId=S1&' + w2 + '&roomNames=R2&lotIds=L2')] })]));
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const width = this.hasAttribute('data-pane-head') ? 600
        : this.dataset.headFixed === 'actions' ? 32
          : this.hasAttribute('data-head-fixed') ? 100
            : this.dataset.chipMeasure === 'chip' ? 120
              : this.dataset.chipMeasure === 'more' ? 44 : 0;
      return { width, height: 0, top: 0, left: 0, right: width, bottom: 0, x: 0, y: 0, toJSON: () => ({}) };
    });
    mount();
    await settle();
    expect(paneGroup(1).querySelectorAll('[data-pane-head] [data-pane-chip]:not([data-pane-chip="more"])')).toHaveLength(2);
    expect(within(paneGroup(1)).queryByRole('button', { name: /같은 조건/ })).toBeNull();
    const more = within(paneGroup(1)).getByRole('button', { name: '칸 1의 조건 2개 더 보기' });
    expect(more).toHaveTextContent('+2');
    fireEvent.click(more);
    const popover = await screen.findByRole('dialog', { name: '칸 1의 분석 Context' });
    expect(popover.querySelectorAll('[data-popover-row]')).toHaveLength(4);
    expect(popover.querySelector('[data-popover-row="scope"]')).not.toHaveTextContent('다름');
    for (const key of ['time', 'roomNames', 'lot']) expect(popover.querySelector('[data-popover-row="' + key + '"]')).toHaveTextContent('다름');
    expect(within(popover).getByRole('button', { name: 'Context 바에서 편집' })).toBeInTheDocument();
  });

  it('opens the pane\'s whole Context in a popover, marking the differing key, and 같음 is hidden when every key differs', async () => {
    two();
    mount();
    await settle();
    fireEvent.click(within(paneGroup(1)).getByRole('button', { name: '칸 1의 같은 조건 1개' }));
    const popover = await screen.findByRole('dialog', { name: '칸 1의 분석 Context' });
    expect(within(popover).getByText('S1')).toBeInTheDocument();
    const time = popover.querySelector('[data-popover-row="time"]')!;
    expect(time).toHaveTextContent('2026-09-01 00:00 ~ 2026-09-02 00:00');
    expect(time).toHaveTextContent('다름');
    expect(popover.querySelector('[data-popover-row="scope"]')).not.toHaveTextContent('다름');
    cleanup();
    seed(boardOf([sheet('a', { layout: '1x2', panes: [pane(`?scopeId=S1&${w1}`), pane(`?scopeId=S2&${w2}`)] })]));
    mount();
    await settle();
    expect(paneGroup(1).querySelectorAll('[data-pane-chip]')).toHaveLength(2);
    expect(within(paneGroup(1)).queryByRole('button', { name: /같은 조건/ })).toBeNull();
  });

  it('shows 조건 N instead of chips while only one pane has content', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [pane(`?scopeId=S1&${w1}`), null] })]));
    mount();
    await settle();
    expect(paneGroup(1).querySelectorAll('[data-pane-chip]')).toHaveLength(0);
    expect(within(paneGroup(1)).getByRole('button', { name: '칸 1의 조건 2개' })).toHaveTextContent('조건 2');
  });

  it('leaves a denied or unreadable pane out of the comparison', async () => {
    seed(boardOf([sheet('a', { layout: '2x2', panes: [pane(`?scopeId=S1&${w1}`), pane(`?scopeId=S2&${w2}`, 'locked'), pane('?from=nope&to=nope'), pane(`?scopeId=S1&${w1}`)] })]));
    mount();
    await settle();
    expect(paneGroup(1).querySelectorAll('[data-pane-chip]')).toHaveLength(0);
    expect(within(paneGroup(1)).getByRole('button', { name: '칸 1의 같은 조건 2개' })).toBeInTheDocument();
    expect(paneGroup(2).querySelector('[data-pane-head] [data-pane-chip]')).toBeNull();
    expect(within(paneGroup(2)).queryByRole('button', { name: /^칸 \d의 (같은 )?조건/ })).toBeNull();
    expect(within(paneGroup(3)).queryByRole('button', { name: /^칸 \d의 (같은 )?조건/ })).toBeNull();
  });

  it('collapses chips that do not fit into one +N chip (menu name keeps its minimum) with its own accessible name', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [pane(`?scopeId=S1&${w1}&roomNames=R1&lotIds=L1`), pane(`?scopeId=S1&${w2}&roomNames=R2&lotIds=L2`)] })]));
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const width = this.hasAttribute('data-pane-head') ? 600 : this.hasAttribute('data-head-fixed') ? 100 : this.dataset.chipMeasure === 'chip' ? 120 : this.dataset.chipMeasure === 'more' ? 60 : 0;
      return { width, height: 0, top: 0, left: 0, right: width, bottom: 0, x: 0, y: 0, toJSON: () => ({}) };
    });
    mount();
    await settle();
    // available = 600 - 16 - 200 - 96 (menu name) - 24 (gaps) = 264: one 120px chip + the 60px overflow chip fit, two chips do not.
    expect(paneGroup(1).querySelectorAll('[data-pane-head] [data-pane-chip]:not([data-pane-chip="more"])')).toHaveLength(1);
    const more = within(paneGroup(1)).getByRole('button', { name: '칸 1의 조건 3개 더 보기' });
    expect(more).toHaveTextContent('+3');
    fireEvent.click(more);
    expect(await screen.findByRole('dialog', { name: '칸 1의 분석 Context' })).toBeInTheDocument();
  });

  describe('chip measuring', () => {
    const roomy = () => seed(boardOf([sheet('a', { layout: '1x2', panes: [pane(`?scopeId=S1&${w1}&roomNames=R1&lotIds=L1`), pane(`?scopeId=S1&${w2}&roomNames=R2&lotIds=L2`)] })]));
    const sizes = { head: 600, fixed: 100, chip: 120, more: 60 };
    const stubSizes = () => vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const width = this.hasAttribute('data-pane-head') ? sizes.head : this.hasAttribute('data-head-fixed') ? sizes.fixed : this.dataset.chipMeasure === 'chip' ? sizes.chip : this.dataset.chipMeasure === 'more' ? sizes.more : 0;
      return { width, height: 0, top: 0, left: 0, right: width, bottom: 0, x: 0, y: 0, toJSON: () => ({}) };
    });
    afterEach(() => { Object.assign(sizes, { head: 600, fixed: 100, chip: 120, more: 60 }); });

    it('keeps +N and its popover when not even one chip fits', async () => {
      roomy();
      sizes.chip = 300;
      stubSizes();
      mount();
      await settle();
      // available = 264: a 300px chip does not fit, so all three differing keys collapse.
      expect(paneGroup(1).querySelectorAll('[data-pane-head] [data-pane-chip]:not([data-pane-chip="more"])')).toHaveLength(0);
      const more = within(paneGroup(1)).getByRole('button', { name: '칸 1의 조건 4개 더 보기' });
      expect(more).toHaveTextContent('+4');
      fireEvent.click(more);
      expect(await screen.findByRole('dialog', { name: '칸 1의 분석 Context' })).toBeInTheDocument();
    });

    it('measures again when a fixed part or a measuring chip changes size', async () => {
      roomy();
      const watchers: { callback: () => void; targets: Element[] }[] = [];
      vi.stubGlobal('ResizeObserver', class {
        entry = { callback: () => {}, targets: [] as Element[] };
        constructor(callback: () => void) { this.entry.callback = callback; watchers.push(this.entry); }
        observe(target: Element) { this.entry.targets.push(target); }
        unobserve() {} disconnect() {}
      });
      stubSizes();
      mount();
      await settle();
      const shown = () => paneGroup(1).querySelectorAll('[data-pane-head] [data-pane-chip]:not([data-pane-chip="more"])').length;
      expect(shown()).toBe(1);
      // A fixed part grows with the head unchanged: squeezed available 296 -> 196, so one chip still fits.
      sizes.fixed = 150;
      act(() => { for (const w of watchers) if (w.targets.some(t => t.hasAttribute('data-head-fixed'))) w.callback(); });
      expect(shown()).toBe(1);
      // A measuring chip grows (e.g. language change) with everything else unchanged.
      sizes.fixed = 100;
      act(() => { for (const w of watchers) if (w.targets.some(t => t.hasAttribute('data-head-fixed'))) w.callback(); });
      expect(shown()).toBe(1);
      sizes.chip = 300;
      act(() => { for (const w of watchers) if (w.targets.some(t => (t as HTMLElement).dataset.chipMeasure === 'chip')) w.callback(); });
      expect(shown()).toBe(0);
    });
  });

  it('a header control selects its pane first', async () => {
    two();
    mount();
    await settle();
    expect(stored().sheets[0].selected).toBe(0);
    openMenu(within(paneGroup(2)).getByRole('button', { name: '칸 2 동작' }));
    await settle();
    expect(stored().sheets[0].selected).toBe(1);
    cleanup();
    seed(boardOf([sheet('a', { layout: '1x2', panes: [pane(`?scopeId=S1&${w1}`), pane(`?scopeId=S1&${w2}`)] })]));
    mount();
    await settle();
    fireEvent.click(within(paneGroup(2)).getByRole('button', { name: '칸 2의 같은 조건 1개' }));
    await settle();
    expect(stored().sheets[0].selected).toBe(1);
  });

  it('Context 바에서 편집 selects the pane and puts focus in the board Context bar', async () => {
    two();
    mount();
    await settle();
    fireEvent.click(within(paneGroup(2)).getByRole('button', { name: '칸 2의 같은 조건 1개' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Context 바에서 편집' }));
    await settle();
    expect(stored().sheets[0].selected).toBe(1);
    const bar = screen.getByRole('region', { name: '칸 2 · 분석 Context' });
    expect(bar.closest('[data-board-context-row]')!.contains(document.activeElement)).toBe(true);
  });
});

describe('⋯ pane menu (docs/16 §4)', () => {
  it('lists the actions in order under the name 칸 N 동작, and 비우기 is gone from the head', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [pane(`?${w1}`), null] })]));
    mount();
    await settle();
    expect(within(paneGroup(1)).queryByRole('button', { name: '칸 1 비우기' })).toBeNull();
    expect(within(paneGroup(2)).queryByRole('button', { name: '칸 2 동작' })).toBeNull();
    await openActions(1);
    const names = (await screen.findAllByRole('menuitem')).map(i => i.textContent);
    expect(names).toEqual(['이 조건을 시트의 모든 칸에 적용조건을 받을 다른 칸이 없습니다', '본 화면에서 열기', '바꾸기', '복제', '비우기']);
  });

  it('applies the pane\'s Context to every other content pane, keeping their page keys except the reset keys, and undoes it', async () => {
    seed(boardOf([sheet('a', { layout: '2x2', panes: [pane(`?scopeId=S1&${w1}&tab=x`), pane(`?scopeId=S2&${w2}&tab=y&page=4`), null, pane(`?${w2}&page=9`, 'beta')] })]));
    mount();
    await settle();
    await openActions(1);
    fireEvent.click(await item(/이 조건을 시트의 모든 칸에 적용/));
    await settle();
    const [first, second, third, fourth] = stored().sheets[0].panes;
    expect(first).toEqual(pane(`?scopeId=S1&${w1}&tab=x`));
    expect(third).toBeNull();
    for (const [changed, tab] of [[second, 'y'], [fourth, null]] as const) {
      const parsed = ctx(changed!.query);
      expect(parsed.global).toEqual(ctx(first!.query).global);
      expect(parsed.page).toEqual(tab === null ? [] : [['tab', tab]]);
    }
    expect(fourth!.menuId).toBe('beta');
    expect(await screen.findByText('칸 1의 조건을 칸 2, 4에 적용했습니다')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '실행 취소' }));
    await settle();
    expect(stored().sheets[0].panes[1]).toEqual(pane(`?scopeId=S2&${w2}&tab=y&page=4`));
    expect(stored().sheets[0].panes[3]).toEqual(pane(`?${w2}&page=9`, 'beta'));
  });

  it('says nothing was restored when a pane the action changed was edited afterwards', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [pane(`?${w1}`), pane(`?${w2}`)] })]));
    mount();
    await settle();
    await openActions(1);
    fireEvent.click(await item(/이 조건을 시트의 모든 칸에 적용/));
    await settle();
    await openActions(2);
    fireEvent.click(await item('비우기'));
    await settle();
    const toast = (await screen.findByText('칸 1의 조건을 칸 2에 적용했습니다')).closest('[data-sonner-toast]') as HTMLElement;
    fireEvent.click(within(toast).getByRole('button', { name: '실행 취소' }));
    await settle();
    expect(await screen.findByText('실행 취소할 수 없습니다 — 그 뒤에 바뀌었습니다')).toBeInTheDocument();
    expect(stored().sheets[0].panes[1]).toBeNull();
  });

  it('turns apply-to-all off, with its reason, when there is no other content pane', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [pane(`?${w1}`), null] })]));
    mount();
    await settle();
    await openActions(1);
    const apply = await item(/이 조건을 시트의 모든 칸에 적용/);
    expect(apply).toHaveAttribute('data-disabled');
    expect(apply).toHaveTextContent('조건을 받을 다른 칸이 없습니다');
  });

  it('본 화면에서 열기 leaves the board for the menu with the pane\'s address', async () => {
    seed(boardOf([sheet('a', { panes: [pane(`?scopeId=S1&${w1}&tab=x`)] })]));
    mount();
    await settle();
    await openActions(1);
    fireEvent.click(await item('본 화면에서 열기'));
    await settle();
    expect(window.location.pathname).toBe('/alpha');
    expect(window.location.search).toBe(`?scopeId=S1&${w1}&tab=x`);
    expect(stored().sheets[0].panes[0]).toEqual(pane(`?scopeId=S1&${w1}&tab=x`));
  });

  it('바꾸기: picker, then a confirm (first focus 취소) that keeps the Context; focus returns to ⋯; undo restores the old screen', async () => {
    seed(boardOf([sheet('a', { panes: [pane(`?scopeId=S1&${w1}&tab=x`)] })]));
    mount();
    await settle();
    await openActions(1);
    fireEvent.click(await item('바꾸기'));
    const picker = await screen.findByRole('dialog', { name: '칸 1에 넣을 분석 화면' });
    fireEvent.click(within(picker).getByRole('button', { name: '베타' }));
    const alert = await screen.findByRole('alertdialog');
    expect(within(alert).getByText('칸 1의 화면을 바꿉니다')).toBeInTheDocument();
    expect(within(alert).getByRole('button', { name: '취소' })).toHaveFocus();
    expect(stored().sheets[0].panes[0]?.menuId).toBe('alpha');
    fireEvent.click(within(alert).getByRole('button', { name: '바꾸기' }));
    await settle();
    const replaced = stored().sheets[0].panes[0]!;
    expect(replaced.menuId).toBe('beta');
    expect(ctx(replaced.query).global).toEqual(ctx(`?scopeId=S1&${w1}`).global);
    expect(ctx(replaced.query).page).toEqual([]);
    expect(within(paneGroup(1)).getByRole('button', { name: '칸 1 동작' })).toHaveFocus();
    fireEvent.click(await screen.findByRole('button', { name: '실행 취소' }));
    await settle();
    expect(stored().sheets[0].panes[0]).toEqual(pane(`?scopeId=S1&${w1}&tab=x`));
  });

  it('바꾸기 cancelled at the confirm, or at the picker, changes nothing and returns focus to ⋯', async () => {
    seed(boardOf([sheet('a', { panes: [pane(`?${w1}`)] })]));
    mount();
    await settle();
    await openActions(1);
    fireEvent.click(await item('바꾸기'));
    fireEvent.click(within(await screen.findByRole('dialog', { name: '칸 1에 넣을 분석 화면' })).getByRole('button', { name: '베타' }));
    fireEvent.click(await within(await screen.findByRole('alertdialog')).findByRole('button', { name: '취소' }));
    await settle();
    expect(stored().sheets[0].panes[0]).toEqual(pane(`?${w1}`));
    expect(within(paneGroup(1)).getByRole('button', { name: '칸 1 동작' })).toHaveFocus();
    await openActions(1);
    fireEvent.click(await item('바꾸기'));
    fireEvent.keyDown(await screen.findByRole('dialog', { name: '칸 1에 넣을 분석 화면' }), { key: 'Escape' });
    await settle();
    expect(within(paneGroup(1)).getByRole('button', { name: '칸 1 동작' })).toHaveFocus();
  });

  it('a denied pane offers 바꾸기 as a fresh screen and never lends its saved Context; 적용 and 복제 are off with a reason', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [pane(`?lotIds=SECRET&${w1}`, 'locked'), null] })]));
    mount();
    await settle();
    await openActions(1);
    for (const name of [/이 조건을 시트의 모든 칸에 적용/, /복제/]) {
      const off = await item(name);
      expect(off).toHaveAttribute('data-disabled');
      expect(off).toHaveTextContent('이 칸의 화면을 열 수 없어 조건을 쓸 수 없습니다');
    }
    fireEvent.click(await item('바꾸기'));
    fireEvent.click(within(await screen.findByRole('dialog', { name: '칸 1에 넣을 분석 화면' })).getByRole('button', { name: '베타' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '바꾸기' }));
    await settle();
    const replaced = stored().sheets[0].panes[0]!;
    expect(replaced.menuId).toBe('beta');
    expect(replaced.query).not.toContain('SECRET');
    expect(ctx(replaced.query).global.lotIds).toBeNull();
  });

  it('복제 puts the same menu, params and query in the first empty pane, with undo; it is off, with its reason, when no pane is empty', async () => {
    seed(boardOf([sheet('a', { layout: '2x2', panes: [pane(`?${w1}&tab=x`), null, null, pane(`?${w2}`)] })]));
    mount();
    await settle();
    await openActions(1);
    fireEvent.click(await item('복제'));
    await settle();
    expect(stored().sheets[0].panes[1]).toEqual(pane(`?${w1}&tab=x`));
    expect(stored().sheets[0].panes[2]).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: '실행 취소' }));
    await settle();
    expect(stored().sheets[0].panes[1]).toBeNull();
    cleanup();
    seed(boardOf([sheet('a', { layout: '1x2', panes: [pane(`?${w1}`), pane(`?${w2}`)] })]));
    mount();
    await settle();
    await openActions(1);
    const duplicate = await item(/복제/);
    expect(duplicate).toHaveAttribute('data-disabled');
    expect(duplicate).toHaveTextContent('빈 칸이 없습니다');
  });

  it('비우기 clears with undo and puts focus on the pane', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [pane(`?${w1}`), pane(`?${w2}`)] })]));
    mount();
    await settle();
    await openActions(1);
    fireEvent.click(await item('비우기'));
    await settle();
    expect(stored().sheets[0].panes[0]).toBeNull();
    expect(paneGroup(1)).toHaveFocus();
    fireEvent.click(await screen.findByRole('button', { name: '실행 취소' }));
    await settle();
    expect(stored().sheets[0].panes[0]).toEqual(pane(`?${w1}`));
  });
});

describe('이 시트 조건을 다른 시트에 복사 (docs/16 §4)', () => {
  const copy = async (target: string) => {
    openMenu(screen.getByRole('button', { name: '시트 동작: a' }));
    const trigger = await screen.findByRole('menuitem', { name: /이 시트 조건을 다른 시트에 복사/ });
    fireEvent.keyDown(trigger, { key: 'ArrowRight' });
    fireEvent.click(await screen.findByRole('menuitem', { name: target }));
    await settle();
  };

  it('copies same-numbered pane Contexts where both panes have content, keeps the target\'s page keys, names the panes in the toast and undoes only the target', async () => {
    seed(boardOf([
      sheet('a', { layout: '2x2', panes: [pane(`?scopeId=S1&${w1}`), pane(`?${w1}`), pane(`?${w1}`), null] }),
      sheet('b', { name: 'B', layout: '2x2', panes: [pane(`?${w2}&tab=q&page=3`, 'beta'), null, pane(`?${w2}&tab=r`), pane(`?${w2}`)] }),
    ]));
    mount();
    await settle();
    await copy('B');
    const target = stored().sheets[1];
    expect(ctx(target.panes[0]!.query).global).toEqual(ctx(`?scopeId=S1&${w1}`).global);
    expect(ctx(target.panes[0]!.query).page).toEqual([['tab', 'q']]);
    expect(target.panes[0]!.menuId).toBe('beta');
    expect(target.panes[1]).toBeNull();
    expect(ctx(target.panes[2]!.query).page).toEqual([['tab', 'r']]);
    expect(target.panes[3]).toEqual(pane(`?${w2}`));
    expect(stored().sheets[0].panes[0]).toEqual(pane(`?scopeId=S1&${w1}`));
    expect(await screen.findByText("칸 1, 3의 조건을 'B'의 같은 칸에 복사했습니다")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '실행 취소' }));
    await settle();
    expect(stored().sheets[1].panes).toEqual(seedTargetPanes());
  });

  function seedTargetPanes() { return [pane(`?${w2}&tab=q&page=3`, 'beta'), null, pane(`?${w2}&tab=r`), pane(`?${w2}`)]; }

  it('writes a consecutive run as a range, and a stale undo changes nothing', async () => {
    seed(boardOf([
      sheet('a', { layout: '1x2', panes: [pane(`?${w1}`), pane(`?${w1}`)] }),
      sheet('b', { name: 'B', layout: '1x2', panes: [pane(`?${w2}`), pane(`?${w2}`)] }),
    ]));
    mount();
    await settle();
    await copy('B');
    expect(await screen.findByText("칸 1–2의 조건을 'B'의 같은 칸에 복사했습니다")).toBeInTheDocument();
    // The target sheet is edited before the undo.
    fireEvent.click(screen.getByRole('tab', { name: 'B' }));
    await settle();
    await openActions(2);
    fireEvent.click(await item('비우기'));
    await settle();
    const toast = screen.getByText("칸 1–2의 조건을 'B'의 같은 칸에 복사했습니다").closest('[data-sonner-toast]') as HTMLElement;
    fireEvent.click(within(toast).getByRole('button', { name: '실행 취소' }));
    await settle();
    expect(await screen.findByText('실행 취소할 수 없습니다 — 그 뒤에 바뀌었습니다')).toBeInTheDocument();
    expect(stored().sheets[1].panes[1]).toBeNull();
    expect(ctx(stored().sheets[1].panes[0]!.query).global.from).toBe('2026-09-01T00:00:00');
  });

  it('says so when there is nothing to copy, and the submenu is off with a single sheet', async () => {
    seed(boardOf([sheet('a', { panes: [pane(`?${w1}`)] }), sheet('b', { name: 'B' })]));
    mount();
    await settle();
    await copy('B');
    expect(await screen.findByText(/'B'에 복사할 칸이 없습니다/)).toBeInTheDocument();
    cleanup();
    seed(boardOf([sheet('a')]));
    mount();
    await settle();
    openMenu(screen.getByRole('button', { name: '시트 동작: a' }));
    expect(await screen.findByRole('menuitem', { name: /이 시트 조건을 다른 시트에 복사/ })).toHaveAttribute('data-disabled');
  });
});

describe('이전 화면 (docs/16 §4)', () => {
  const previousButton = (n: number) => within(paneGroup(n)).queryByRole('button', { name: '이전 화면' });

  it('appears after a push to another menu, goes back one step, and is then gone', async () => {
    seed(boardOf([sheet('a', { panes: [pane(`?${w1}&tab=x`)] })]));
    mount();
    await settle();
    expect(previousButton(1)).toBeNull();
    fireEvent.click(within(paneGroup(1)).getByRole('button', { name: 'go beta' }));
    await settle();
    expect(stored().sheets[0].panes[0]!.menuId).toBe('beta');
    expect(stored().sheets[0].previous).toEqual([pane(`?${w1}&tab=x`)]);
    fireEvent.click(previousButton(1)!);
    await settle();
    expect(stored().sheets[0].panes[0]).toEqual(pane(`?${w1}&tab=x`));
    expect(stored().sheets[0].previous).toBeUndefined();
    expect(previousButton(1)).toBeNull();
  });

  it('does not appear after a replace, or after a Context write inside the same menu', async () => {
    seed(boardOf([sheet('a', { panes: [pane(`?${w1}`)] })]));
    mount();
    await settle();
    fireEvent.click(within(paneGroup(1)).getByRole('button', { name: 'replace beta' }));
    await settle();
    expect(stored().sheets[0].panes[0]!.menuId).toBe('beta');
    expect(previousButton(1)).toBeNull();
    cleanup();
    seed(boardOf([sheet('a', { panes: [pane(`?${w1}`)] })]));
    mount();
    await settle();
    fireEvent.click(within(screen.getByRole('region', { name: '칸 1 · 분석 Context' })).getByRole('button', { name: /기간/ }));
    fireEvent.click(await screen.findByRole('radio', { name: '7일' }));
    await settle();
    expect(stored().sheets[0].panes[0]!.query).not.toBe(`?${w1}`);
    expect(previousButton(1)).toBeNull();
  });

  it('is dropped when the pane is cleared or replaced through ⋯', async () => {
    seed(boardOf([sheet('a', { panes: [pane(`?${w1}`)] })]));
    mount();
    await settle();
    fireEvent.click(within(paneGroup(1)).getByRole('button', { name: 'go beta' }));
    await settle();
    await openActions(1);
    fireEvent.click(await item('비우기'));
    await settle();
    expect(stored().sheets[0].previous).toBeUndefined();
    fireEvent.click(await screen.findByRole('button', { name: '실행 취소' }));
    await settle();
    expect(previousButton(1)).toBeNull();
  });
});

describe('detail slot sharing (docs/16 §5)', () => {
  const inShell = () => {
    window.history.replaceState(null, '', '/board?sheet=a');
    const session = testSession(['platform:view']);
    return render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}><AppShell><RouteOutlet /></AppShell></PlatformProvider></I18nProvider>);
  };

  it('captions the panel 칸 N · 메뉴, keeps it when another pane is selected, and closes it when that pane\'s Context changes', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [{ menuId: 'drawer', params: {}, query: `?${w1}` }, pane(`?${w1}`)] })]));
    inShell();
    await settle();
    const panel = screen.getByRole('dialog', { name: '상세 제목' });
    expect(panel.querySelector('[data-detail-pane-label]')).toHaveTextContent('칸 1 · 서랍');
    fireEvent.click(within(paneGroup(2)).getByRole('button', { name: '칸 2 선택' }));
    await settle();
    expect(screen.getByRole('dialog', { name: '상세 제목' })).toBeInTheDocument();
    fireEvent.click(within(paneGroup(1)).getByRole('button', { name: '칸 1 선택' }));
    fireEvent.click(within(screen.getByRole('region', { name: '칸 1 · 분석 Context' })).getByRole('button', { name: /기간/ }));
    fireEvent.click(await screen.findByRole('radio', { name: '7일' }));
    await settle();
    expect(screen.queryByRole('dialog', { name: '상세 제목' })).toBeNull();
  });
});

describe('collapsed pane header focus return', () => {
  it.each(['Escape', 'menu item'])('returns focus to the collapsed pane action trigger after %s', async closeWith => {
    const user = userEvent.setup();
    seed(boardOf([sheet('a', { layout: '2x2', panes: [pane(`?${w1}`), pane(`?${w1}`), null, null] })]));
    mount();
    await settle();
    await user.click(screen.getByRole('button', { name: '칸 1 접기' }));
    const trigger = within(paneGroup(1)).getByRole('button', { name: '칸 1 동작' });
    await user.click(trigger);
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    if (closeWith === 'Escape') await user.keyboard('{Escape}');
    else await user.click(await item('복제'));
    await settle();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('returns focus to the collapsed pane same-conditions trigger after Escape', async () => {
    const user = userEvent.setup();
    seed(boardOf([sheet('a', { layout: '2x2', panes: [pane(`?${w1}`), pane(`?${w1}`), null, null] })]));
    mount();
    await settle();
    await user.click(screen.getByRole('button', { name: '칸 1 접기' }));
    const trigger = within(paneGroup(1)).getByRole('button', { name: /칸 1의 같은 조건/ });
    await user.click(trigger);
    expect(await screen.findByRole('dialog', { name: '칸 1의 분석 Context' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await settle();
    expect(screen.queryByRole('dialog', { name: '칸 1의 분석 Context' })).toBeNull();
    expect(trigger).toHaveFocus();
  });
});

describe('presentation Escape and portal ownership', () => {
  it.each(['menu', 'popover', 'picker'])('%s consumes Escape before maximize and returns focus after restore', async overlay => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [pane(`?${w1}`), pane(`?${w1}`)] })]));
    mount(); await settle();
    fireEvent.click(screen.getByRole('button', { name: '칸 1 최대화' }));
    if (overlay === 'menu' || overlay === 'picker') {
      await openActions(1);
      if (overlay === 'picker') { fireEvent.click(await item('바꾸기')); await settle(); }
    } else { fireEvent.click(screen.getByRole('button', { name: /칸 1의 같은 조건/ })); await settle(); }
    const layer = overlay === 'menu' ? screen.getByRole('menu') : screen.getByRole('dialog');
    fireEvent.keyDown(layer, { key: 'Escape' }); await settle();
    expect(screen.getByRole('button', { name: '원래 크기로' })).toBeInTheDocument();
    expect(screen.queryByRole('menu')).toBeNull(); expect(screen.queryByRole('dialog')).toBeNull();
    const restore = screen.getByRole('button', { name: '원래 크기로' });
    fireEvent.keyDown(restore, { key: 'Escape' }); await settle();
    expect(screen.getByRole('button', { name: '칸 1 최대화' })).toHaveFocus();
  });
  it('hiding a pane closes its Context portal and cannot redirect focus back into the hidden owner', async () => {
    seed(boardOf([sheet('a', { layout: '2x2', panes: [pane(`?${w1}`), pane(`?${w1}`), null, null] })]));
    mount(); await settle();
    fireEvent.click(screen.getByRole('button', { name: /칸 1의 같은 조건/ })); await settle();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '칸 2 최대화' })); await settle();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: '원래 크기로' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('button', { name: '원래 크기로' }), { key: 'Escape' }); await settle();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('detail Escape closes detail first; Escape in the board restores maximize while keeping shared detail', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [pane(`?${w1}`, 'drawer'), pane(`?${w1}`)] })]));
    window.history.replaceState(null, '', '/board?sheet=a');
    const session = testSession(['platform:view']);
    render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}><AppShell><RouteOutlet /></AppShell></PlatformProvider></I18nProvider>);
    await settle();
    fireEvent.click(screen.getByRole('button', { name: '칸 2 최대화' }));
    const restore = screen.getByRole('button', { name: '원래 크기로' });
    fireEvent.keyDown(restore, { key: 'Escape' }); await settle();
    expect(screen.getByRole('dialog', { name: '상세 제목' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '칸 2 최대화' }));
    const close = screen.getByRole('button', { name: '상세 닫기' });
    close.focus(); fireEvent.keyDown(close, { key: 'Escape' }); await settle();
    expect(screen.queryByRole('dialog', { name: '상세 제목' })).toBeNull();
    expect(screen.getByRole('button', { name: '원래 크기로' })).toBeInTheDocument();
    expect(document.activeElement?.closest('[inert], [hidden]')).toBeNull();
  });
});
