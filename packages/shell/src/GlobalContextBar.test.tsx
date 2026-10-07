import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import type { Capability, PlatformAdapter, Session } from '@ap/contracts';
import { GlobalContextBar } from './GlobalContextBar';

const caps = { time: 'reference', roomNames: 'apply', condition: 'apply', selection: 'apply', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' } as const;
const registryWith = (context: Record<keyof typeof caps, Capability>) => createRegistry({
  spaces: [{ id: 'analytics', label: { ko: '분석', en: 'Analytics' }, homeMenuId: 'home' }],
  groups: [{ id: 'overview', label: { ko: '개요', en: 'Overview' }, icon: House, space: 'analytics' }],
  menus: [{ id: 'home', group: 'overview', primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: true, context, pageType: 'overview', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});
const registry = registryWith(caps);
const forbidden = { outcome: 'forbidden' as const, data: null, assessments: [], trust: null, correlationId: 'fixture' };
const evaluation = vi.fn(async () => ({ inCondition: [], outOfCondition: [] }));
const session: Session = { user: { id: 'u', name: 'u', title: { ko: 'u', en: 'u' }, permissions: ['platform:view'] }, scopes: [{ id: 'ICH', label: 'ICH', grantedRooms: 1, totalRooms: 1 }] };
const adapter: PlatformAdapter = {
  session: () => session,
  validateScope: async () => ({ status: 'valid', scopeId: 'ICH', grantedRooms: ['PH-101'] }),
  defaultRangeTo: () => '2026-09-26T09:00:00', publishedMetrics: () => [],
  contextOptions: async () => ({ stgroup: [], team: [], makerModel: [] }), evaluateSelection: evaluation,
  menuQuery: async () => forbidden, getEntity: async () => forbidden, auditTrail: async () => forbidden, entityAudit: async () => forbidden,
  accessDirectory: async () => forbidden, recordUsage: async () => ({ accepted: 0 }), usageSummary: async () => forbidden,
  listAnnotations: async () => forbidden, saveAnnotation: async () => forbidden, reportClientError: async () => ({ accepted: true }), subscribe: () => () => {},
};
let barWidth = 2000;
let resize: (() => void) | undefined;
let observed: Element | undefined;
let reads = 0;
let keyWidths: Record<string, number> = {};
let probeResize: (() => void) | undefined;
const fontsDescriptor = Object.getOwnPropertyDescriptor(document, 'fonts');
beforeEach(() => {
  barWidth = 2000; reads = 0; keyWidths = {}; resize = undefined; probeResize = undefined; observed = undefined; evaluation.mockClear();
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
  vi.stubGlobal('ResizeObserver', class {
    constructor(private callback: () => void) {}
    observe(element: Element) {
      if (element.getAttribute('role') === 'region') { observed = element; resize = this.callback; }
      if (element.hasAttribute('data-context-measuring')) probeResize = this.callback;
    }
    unobserve() {}
    disconnect() {}
  });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) { return this.getAttribute('role') === 'region' ? Math.round(barWidth) : 0; });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    reads++;
    const name = this.dataset.measure;
    const width = this.getAttribute('role') === 'region' ? barWidth
      : this.hasAttribute('data-measure-key') ? (keyWidths[this.dataset.measureKey!] ?? (this.dataset.measureKey === 'time' ? 450 : 100))
      : name === 'period' ? 220 : name === 'actions' ? 160 : name === 'icons' ? 64 : name === 'label' ? 80
      : this.hasAttribute('data-measure-overflow') ? (this.textContent?.includes('적용 중') || this.textContent?.includes('applied') ? 190 : 110) : 0;
    return { width, height: 32, x: 0, y: 0, top: 0, left: 0, right: width, bottom: 32, toJSON() {} };
  });
});
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  if (fontsDescriptor) Object.defineProperty(document, 'fonts', fontsDescriptor); else Reflect.deleteProperty(document, 'fonts');
});
const bar = () => screen.getByRole('region', { name: '전역 Context' });
const visibleContextLabel = () => Array.from(bar().querySelectorAll('span'))
  .some(label => label.textContent === '전역 Context' && !label.closest('[data-context-measuring]'));
function mount(extra = '', lang: 'ko' | 'en' = 'ko', period = true, menus = registry) {
  localStorage.setItem('platform:lang', lang);
  window.history.replaceState(null, '', `/?v=1&scopeId=ICH${period ? '&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00' : ''}${extra}`);
  return render(<I18nProvider><PlatformProvider adapter={adapter} registry={menus}><GlobalContextBar /></PlatformProvider></I18nProvider>);
}
function width(value: number) { act(() => { barWidth = value; resize?.(); }); }
const inlineKeys = () => Array.from(bar().querySelectorAll('[data-context-key]'), el => el.getAttribute('data-context-key'));

describe('Global Context priority overflow (#56)', () => {
  it('keeps every control inline at wide widths and observes the bar, not the viewport', async () => {
    mount('&lotIds=L1&ppid=P1&recipeIds=R1&metricId=M1&metricVersion=1');
    expect(observed).toBe(bar());
    expect(inlineKeys()).toEqual(['time', 'roomNames', 'condition', 'selection', 'lot', 'ppid', 'recipe', 'metric']);
    expect(within(bar()).queryByRole('button', { name: /개 더/ })).toBeNull();
    expect(within(bar()).getByRole('radio', { name: '1일' })).toBeVisible();
    await screen.findByRole('button', { name: '설비 선택 전체' });
    await vi.waitFor(() => expect(evaluation).toHaveBeenCalledTimes(1)); // one owner; inert copies never query
  });

  it('hides only the label at 1400px and keeps the label at wide widths', () => {
    barWidth = 1400;
    mount('&lotIds=L1&ppid=P1&recipeIds=R1&metricId=M1&metricVersion=1');
    expect(visibleContextLabel()).toBe(false);
    expect(within(bar()).getByRole('radio', { name: '1일' })).toBeVisible();
    expect(inlineKeys()).toHaveLength(8);
    for (const name of ['링크 복사', '초기화']) {
      expect(within(bar()).getByRole('button', { name }).textContent).toContain(name);
    }

    width(2000);
    expect(visibleContextLabel()).toBe(true);
  });

  it('hides the label before compacting presets and then removes trailing keys in fixed priority order', () => {
    mount('&lotIds=L1&ppid=P1&recipeIds=R1&metricId=M1&metricVersion=1');
    const initialReads = reads;
    const initialQueries = evaluation.mock.calls.length;
    width(1100);
    expect(within(bar()).queryByRole('radio', { name: '1일' })).toBeNull();
    expect(inlineKeys()).toEqual(['time', 'roomNames', 'condition', 'selection', 'lot', 'ppid', 'recipe', 'metric']);
    width(760);
    expect(inlineKeys()).toEqual(['time', 'roomNames', 'condition']);
    expect(within(bar()).getByRole('button', { name: '조건 5개 더 · 4개 적용 중' })).toBeVisible();
    width(450);
    expect(inlineKeys()).toEqual(['time']);
    expect(within(bar()).getByRole('button', { name: '조건 7개 더 · 4개 적용 중' })).toBeVisible();
    expect(reads).toBeGreaterThan(initialReads);
    fireEvent.click(within(bar()).getByRole('button', { name: '조건 7개 더 · 4개 적용 중' }));
    const overflow = screen.getByRole('dialog', { name: '추가 Context 조건' });
    expect(within(overflow).getAllByText('이 화면에서 미사용')).toHaveLength(4);
    expect(within(overflow).queryByText('적용', { exact: true })).toBeNull();
    expect(Array.from(bar().querySelectorAll('span')).some(tag => tag.textContent === '참조만' && !tag.closest('[data-context-measuring]'))).toBe(true);
    width(2000);
    expect(inlineKeys()).toHaveLength(8);
    expect(evaluation.mock.calls.length).toBe(initialQueries);
  });

  it('omits a zero applied suffix, preserves icon names and title, and places presets in the period popover', () => {
    barWidth = 450; mount();
    expect(within(bar()).getByRole('button', { name: '조건 3개 더' })).toBeVisible();
    for (const name of ['링크 복사', '초기화']) {
      const button = within(bar()).getByRole('button', { name });
      expect(button).toHaveAttribute('title', name);
      expect(button.textContent).toBe('');
    }
    const period = within(bar()).getByRole('button', { name: /^기간:/ });
    expect(period).toHaveAttribute('title', '기간: 2026-09-25T09:00:00 – 2026-09-26T09:00:00');
    expect(period).toHaveAccessibleName('기간: 2026-09-25T09:00:00 – 2026-09-26T09:00:00, 참조만');
    fireEvent.click(period);
    expect(screen.getByRole('radio', { name: '7일' })).toBeVisible();
  });

  it('counts explicit empty as applied and edits the same Selection setter from the overflow', async () => {
    barWidth = 450; mount('&equipmentSelection=none');
    const more = within(bar()).getByRole('button', { name: '조건 3개 더 · 1개 적용 중' });
    fireEvent.click(more);
    const popover = screen.getByRole('dialog', { name: '추가 Context 조건' });
    expect(Array.from(popover.querySelectorAll('[data-context-key]'), el => el.getAttribute('data-context-key'))).toEqual(['roomNames', 'condition', 'selection']);
    const initialReads = reads;
    fireEvent.click(within(popover).getByRole('button', { name: '설비 선택 명시적 빈 집합' }));
    fireEvent.click(screen.getByRole('radio', { name: '전체' }));
    fireEvent.click(screen.getByRole('button', { name: '적용' }));
    await vi.waitFor(() => expect(new URLSearchParams(window.location.search).has('equipmentSelection')).toBe(false));
    expect(within(bar()).getByRole('button', { name: '조건 3개 더' })).toBeVisible();
    expect(reads).toBeGreaterThan(initialReads);
  });

  it('uses the confirmed English overflow wording', () => {
    barWidth = 450; mount('&equipmentSelection=none', 'en');
    expect(screen.getByRole('button', { name: '3 more · 1 applied' })).toBeVisible();
  });

  it('remeasures intrinsic widths when the probe resizes without a Context revision (P2-1)', () => {
    barWidth = 1100; mount();
    expect(within(bar()).getByRole('radio', { name: '1일' })).toBeVisible();
    act(() => { keyWidths.roomNames = 500; probeResize?.(); });
    expect(within(bar()).queryByRole('radio', { name: '1일' })).toBeNull();
    act(() => { keyWidths = {}; probeResize?.(); });
    expect(within(bar()).getByRole('radio', { name: '1일' })).toBeVisible();
  });

  for (const event of ['ready', 'loadingdone']) {
    it(`remeasures on document.fonts ${event} and ignores late events after cleanup (P2-1)`, async () => {
      let ready!: () => void;
      const fonts = Object.assign(new EventTarget(), { ready: new Promise<void>(resolve => { ready = resolve; }) });
      Object.defineProperty(document, 'fonts', { configurable: true, value: fonts });
      barWidth = 1100; const view = mount();
      // Settle Scope validation and Selection evaluation before changing only font metrics.
      await act(async () => { await Promise.resolve(); });
      expect(within(bar()).getByRole('radio', { name: '1일' })).toBeVisible();
      keyWidths.roomNames = 500;
      await act(async () => { if (event === 'ready') ready(); else fonts.dispatchEvent(new Event('loadingdone')); });
      expect(within(bar()).queryByRole('radio', { name: '1일' })).toBeNull();
      view.unmount();
      const previousReads = reads;
      await act(async () => { ready(); fonts.dispatchEvent(new Event('loadingdone')); });
      expect(reads).toBe(previousReads);
    });
  }

  it('omits the English applied capability tag while keeping Apply as the editor action (P2-2)', () => {
    mount('', 'en');
    const editor = screen.getByRole('button', { name: 'room_name All' });
    fireEvent.click(editor);
    expect(screen.getByRole('button', { name: 'Apply' })).toBeVisible();
  });

  it('gives the overflow trigger and every measurement copy the shared secondary surface (UIUX-56-01, ADR-0023 C3)', () => {
    barWidth = 450; mount();
    const trigger = within(bar()).getByRole('button', { name: '조건 3개 더' });
    // ADR-0023 C3: Buttons take no platform border; trigger↔copy parity comes from the shared variant
    // (same size+variant keeps the width measurement true).
    expect(trigger).toHaveClass('bg-surface-raised');
    expect(trigger).not.toHaveClass('border-border-control');
    for (const button of bar().querySelectorAll('[data-measure-overflow]')) {
      expect(button).toHaveClass('bg-surface-raised');
      expect(button).not.toHaveClass('border-border-control');
    }
  });

  it('keeps unapplied room drafts through inline → overflow → inline and restores connected bar focus (UIUX-56-02)', async () => {
    mount();
    fireEvent.click(within(bar()).getByRole('button', { name: 'room_name 전체' }));
    fireEvent.click(screen.getByRole('radio', { name: '명시 선택' }));
    const checkbox = await screen.findByRole('checkbox', { name: 'PH-101' });
    fireEvent.click(checkbox);
    checkbox.focus();
    for (const nextWidth of [450, 2000]) {
      width(nextWidth);
      await vi.waitFor(() => expect(screen.getByRole('checkbox', { name: 'PH-101' })).toBeChecked());
      await vi.waitFor(() => expect(bar().contains(document.activeElement)).toBe(true));
      expect(new URLSearchParams(window.location.search).has('roomNames')).toBe(false);
    }
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(bar().contains(document.activeElement)).toBe(true);
  });

  it('returns focus to the bar when the last hidden carried key is removed (P3-2)', async () => {
    barWidth = 830; keyWidths.lot = 500; mount('&lotIds=L1');
    fireEvent.click(within(bar()).getByRole('button', { name: '조건 1개 더 · 1개 적용 중' }));
    const remove = screen.getByRole('button', { name: '지우기 Lot' });
    remove.focus();
    fireEvent.click(remove);
    await vi.waitFor(() => expect(within(bar()).queryByRole('button', { name: /개 더/ })).toBeNull());
    await vi.waitFor(() => expect(bar().contains(document.activeElement)).toBe(true));
  });

  it('gives an unset period the selection prompt as its accessible name and title (P3-1)', () => {
    mount('', 'ko', false);
    expect(within(bar()).getByRole('button', { name: '기간: 기간을 선택하세요, 참조만' })).toHaveAttribute('title', '기간: 기간을 선택하세요');
  });

  it('keeps the exception status in period names that replace the visible tag (#218 review)', () => {
    mount();
    expect(within(bar()).getByRole('button', { name: '기간: 2026-09-25T09:00:00 – 2026-09-26T09:00:00, 참조만' })).toBeVisible();
    cleanup();
    mount('', 'ko', true, registryWith({ ...caps, time: 'unsupported' }));
    expect(within(bar()).getByRole('group', { name: '기간: 2026-09-25T09:00:00 – 2026-09-26T09:00:00, 이 화면에서 미사용' })).toBeVisible();
    cleanup();
    mount('', 'ko', true, registryWith({ ...caps, time: 'apply' }));
    expect(within(bar()).getByRole('button', { name: '기간: 2026-09-25T09:00:00 – 2026-09-26T09:00:00' })).toBeVisible();
  });

  it('measures once and responds to window resize when ResizeObserver is unavailable (P3-3)', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    mount();
    expect(inlineKeys()).toHaveLength(4);
    act(() => { barWidth = 450; window.dispatchEvent(new Event('resize')); });
    expect(within(bar()).getByRole('button', { name: '조건 3개 더' })).toBeVisible();
  });

  it('uses fractional available width at an exact fit boundary (P3-4)', () => {
    barWidth = 941.6; mount(); // Label-free full controls need 942px; rounded clientWidth would admit them.
    expect(within(bar()).queryByRole('radio', { name: '1일' })).toBeNull();
  });

});
