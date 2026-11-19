import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { GlobalContextBar } from '../GlobalContextBar';
import { memoryStorage, testAdapter, testSession, testSpace, useToastsForTest } from '@ap/kernel/testing';
import { groupId, spaceId, type Capability } from '@ap/contracts';

const caps = { time: 'reference', roomNames: 'apply', line: 'unsupported', prcGroup: 'unsupported', condition: 'apply', selection: 'apply', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' } as const;
const registryWith = (context: Record<keyof typeof caps, Capability>) => createRegistry({
  spaces: [testSpace()],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: true, context, pageType: 'overview', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});
const registry = registryWith(caps);
const forbidden = { outcome: 'forbidden' as const, data: null, assessments: [], trust: null, correlationId: 'fixture' };
const evaluation = vi.fn(async () => ({ inCondition: [], outOfCondition: [] }));
const session = testSession(['platform:view'], { user: { id: 'u' }, scopes: [{ id: 'MEM', label: 'MEM', grantedRooms: 1, totalRooms: 1 }] });
const adapter = testAdapter({
  session: () => session,
  validateScope: async () => ({ status: 'valid', scopeId: 'MEM', grantedRooms: ['PHOTO'] }),
  evaluateSelection: evaluation,
  listEquipmentFacts: async () => ({ version: '1', items: [
    { equipmentId: 'E1', room: 'PHOTO', axes: { stgroup: ['st-01'], team: ['T1'], maker: ['X'], model: ['Y'] } },
    { equipmentId: 'E2', room: 'PHOTO', axes: { stgroup: ['st-02'], team: ['T2'], maker: ['OTHER'], model: ['OTHER'] } },
  ] }),
  getEntity: async () => forbidden,
  listAnnotations: async () => forbidden,
});
let barWidth = 2000;
let resize: (() => void) | undefined;
let observed: Element | undefined;
let reads = 0;
let keyWidths: Record<string, number> = {};
let probeResize: (() => void) | undefined;
const fontsDescriptor = Object.getOwnPropertyDescriptor(document, 'fonts');
beforeEach(() => {
  barWidth = 2000; reads = 0; keyWidths = {}; resize = undefined; probeResize = undefined; observed = undefined; evaluation.mockClear();
  vi.stubGlobal('localStorage', memoryStorage());
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
      : name === 'period' ? 220 : name === 'actions' ? 160 : name === 'icons' ? 64
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
function mount(extra = '', lang: 'ko' | 'en' = 'ko', period = true, menus = registry, serverAdapter = adapter) {
  localStorage.setItem('platform:lang', lang);
  window.history.replaceState(null, '', `/?v=1&scopeId=MEM${period ? '&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00' : ''}${extra}`);
  return render(<I18nProvider><PlatformProvider equipmentAxes={equipmentAxes} adapter={serverAdapter} registry={menus}><GlobalContextBar /></PlatformProvider></I18nProvider>);
}
function width(value: number) { act(() => { barWidth = value; resize?.(); }); }
const inlineKeys = () => Array.from(bar().querySelectorAll('[data-context-key]'), el => el.getAttribute('data-context-key'));

describe('Global Context priority overflow (#56)', () => {
  it('uses an opaque canvas band and the shared period-control transparency rule', () => {
    mount();
    expect(bar()).toHaveClass('bg-surface-canvas', 'backdrop-blur');
    expect(bar()).toHaveAttribute('data-canvas-band');
    expect(bar()).not.toHaveClass('bg-surface-canvas/95');
    const period = within(bar()).getByRole('button', { name: /^기간:/ });
    expect(period).toHaveClass('bg-surface-card', 'on-canvas-band:bg-transparent');
    // Every filled control on the band (target chip, overflow chip, carried chips) follows the same rule (#2485).
    const filled = Array.from(bar().querySelectorAll('.bg-surface-card'));
    expect(filled.length).toBeGreaterThan(1);
    for (const el of filled) expect(el).toHaveClass('on-canvas-band:bg-transparent');
  });

  it('names the period editor dialog after the period (#2487, WCAG 4.1.2)', async () => {
    mount();
    fireEvent.click(within(bar()).getByRole('button', { name: /^기간:/ }));
    expect(await screen.findByRole('dialog', { name: '기간' })).toBeInTheDocument();
  });

  it('uses badge typography for capability tags', () => {
    mount();
    const tags = within(bar()).getAllByText('참조만', { exact: true });
    for (const tag of tags) {
      expect(tag).toHaveClass('t-badge');
      expect(tag).not.toHaveClass('text-caption', 'font-semibold');
    }
  });

  it('keeps every control inline at wide widths and observes the bar, not the viewport', async () => {
    mount('&lotIds=L1&ppid=P1&recipeIds=R1&metricId=M1&metricVersion=1');
    expect(observed).toBe(bar());
    expect(inlineKeys()).toEqual(['time', 'target', 'lot', 'ppid', 'recipe', 'metric']);
    expect(within(bar()).queryByRole('button', { name: /개 더/ })).toBeNull();
    expect(within(bar()).getByRole('radio', { name: '1일' })).toBeVisible();
    await screen.findByRole('button', { name: '대상 전체' });
    await vi.waitFor(() => expect(evaluation).not.toHaveBeenCalled()); // one owner; inert copies never query
  });

  it('never draws the "전역 Context" label at any width; the region name stays the accessible name', () => {
    barWidth = 1400;
    mount('&lotIds=L1&ppid=P1&recipeIds=R1&metricId=M1&metricVersion=1');
    expect(visibleContextLabel()).toBe(false);
    expect(screen.queryAllByText('전역 Context', { exact: true })).toHaveLength(0);
    expect(within(bar()).getByRole('radio', { name: '1일' })).toBeVisible();
    expect(inlineKeys()).toHaveLength(6);
    for (const [name, text] of [['현재 조건 공유', '현재 조건 공유'], ['조건 초기화', '초기화']]) {
      expect(within(bar()).getByRole('button', { name }).textContent).toContain(text);
    }

    width(2000);
    expect(visibleContextLabel()).toBe(false);
    expect(bar()).toHaveAccessibleName('전역 Context');
    width(350);
    expect(visibleContextLabel()).toBe(false);
    expect(bar().textContent).not.toContain('전역 Context');
  });

  it('compacts presets first and then removes trailing keys in fixed priority order', () => {
    mount('&lotIds=L1&ppid=P1&recipeIds=R1&metricId=M1&metricVersion=1');
    const initialReads = reads;
    const initialQueries = evaluation.mock.calls.length;
    width(1100);
    expect(within(bar()).queryByRole('radio', { name: '1일' })).toBeNull();
    expect(inlineKeys()).toEqual(['time', 'target', 'lot', 'ppid', 'recipe', 'metric']);
    width(760);
    expect(inlineKeys()).toEqual(['time', 'target', 'lot']);
    expect(within(bar()).getByRole('button', { name: '조건 3개 더 · 3개 적용 중' })).toBeVisible();
    width(350);
    expect(inlineKeys()).toEqual(['time']);
    expect(within(bar()).getByRole('button', { name: '조건 5개 더 · 4개 적용 중' })).toBeVisible();
    expect(reads).toBeGreaterThan(initialReads);
    fireEvent.click(within(bar()).getByRole('button', { name: '조건 5개 더 · 4개 적용 중' }));
    const overflow = screen.getByRole('dialog', { name: '추가 Context 조건' });
    expect(within(overflow).getAllByText('이 화면에서 미사용')).toHaveLength(4);
    expect(within(overflow).queryByText('적용', { exact: true })).toBeNull();
    expect(Array.from(bar().querySelectorAll('span')).some(tag => tag.textContent === '참조만' && !tag.closest('[data-context-measuring]'))).toBe(true);
    width(2000);
    expect(inlineKeys()).toHaveLength(6);
    expect(evaluation.mock.calls.length).toBe(initialQueries);
  });

  it('omits a zero applied suffix, preserves icon names and title, and places presets in the period popover', () => {
    barWidth = 350; mount();
    expect(within(bar()).getByRole('button', { name: '조건 1개 더' })).toBeVisible();
    // The share label stays visible when compact (kernel.md §11); only the reset button collapses to its icon.
    expect(within(bar()).getByRole('button', { name: '현재 조건 공유' }).textContent).toBe('현재 조건 공유');
    const reset = within(bar()).getByRole('button', { name: '조건 초기화' });
    expect(reset).toHaveAttribute('title', '조건 초기화');
    expect(reset.textContent).toBe('');
    const period = within(bar()).getByRole('button', { name: /^기간:/ });
    expect(period).toHaveAttribute('title', '기간: 09-25 09:00 → 09-26 09:00 (24h)');
    expect(period).toHaveAccessibleName('기간: 09-25 09:00 → 09-26 09:00 (24h), 참조만');
    fireEvent.click(period);
    expect(screen.getByRole('radio', { name: '7일' })).toBeVisible();
  });

  it('counts explicit empty as applied and edits the same Selection setter from the overflow', async () => {
    barWidth = 350; mount('&equipmentSelection=none');
    fireEvent.click(within(bar()).getByRole('button', { name: '조건 1개 더 · 1개 적용 중' }));
    const popover = screen.getByRole('dialog', { name: '추가 Context 조건' });
    expect(Array.from(popover.querySelectorAll('[data-context-key]'), el => el.getAttribute('data-context-key'))).toEqual(['target']);
    fireEvent.click(within(popover).getByRole('button', { name: /대상 전체 · 빈 선택/ }));
    fireEvent.click((await screen.findAllByRole('button', { name: '취소' }))[0]);
    expect(new URLSearchParams(window.location.search).get('equipmentSelection')).toBe('none');
    fireEvent.click(within(popover).getByRole('button', { name: /대상 전체 · 빈 선택/ }));
    fireEvent.click(await screen.findByRole('button', { name: '조건 적용 · 2대' }));
    await vi.waitFor(() => expect(new URLSearchParams(window.location.search).has('equipmentSelection')).toBe(false));
    expect(within(bar()).getByRole('button', { name: '조건 1개 더' })).toBeVisible();
  });

  it('uses the confirmed English overflow wording', () => {
    barWidth = 350; mount('&equipmentSelection=none', 'en');
    expect(screen.getByRole('button', { name: '1 more · 1 applied' })).toBeVisible();
  });

  it('remeasures intrinsic widths when the probe resizes without a Context revision (P2-1)', () => {
    barWidth = 1100; mount();
    expect(within(bar()).getByRole('radio', { name: '1일' })).toBeVisible();
    act(() => { keyWidths.target = 500; probeResize?.(); });
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
      keyWidths.target = 500;
      await act(async () => { if (event === 'ready') ready(); else fonts.dispatchEvent(new Event('loadingdone')); });
      expect(within(bar()).queryByRole('radio', { name: '1일' })).toBeNull();
      view.unmount();
      const previousReads = reads;
      await act(async () => { ready(); fonts.dispatchEvent(new Event('loadingdone')); });
      expect(reads).toBe(previousReads);
    });
  }

  it('omits the English applied capability tag while keeping Apply as the editor action (P2-2)', async () => {
    mount('', 'en');
    fireEvent.click(screen.getByRole('button', { name: 'Targets All' }));
    expect(await screen.findByRole('button', { name: /Apply rule/ })).toBeVisible();
  });

  it('reopens the custom range editor when the applied custom preset is pressed again (#228 review)', async () => {
    mount('&from=2026-09-22T09:00:00&to=2026-09-24T09:00:00', 'ko', false);
    const custom = within(bar()).getByRole('radio', { name: '사용자 지정' });
    expect(custom).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(custom);
    expect(await screen.findByText('시작일')).toBeVisible();
    fireEvent.click(screen.getAllByRole('button', { name: '취소' })[0]);
    await vi.waitFor(() => expect(screen.queryByText('시작일')).toBeNull());
    fireEvent.click(within(bar()).getByRole('radio', { name: '사용자 지정' }));
    expect(await screen.findByText('시작일')).toBeVisible();
  });

  // Measurement parity: the inert copies must render exactly like the real trigger or the overflow math drifts.
  // UIUX-56-01 / #240: the trigger is one more Context chip, so it shares the neighbouring chips' border.
  it('renders the overflow trigger and every measurement copy as a Context chip with the same classes', () => {
    barWidth = 350; mount();
    const trigger = within(bar()).getByRole('button', { name: '조건 1개 더' });
    const copies = Array.from(bar().querySelectorAll('[data-measure-overflow]'));
    expect(copies.length).toBeGreaterThan(0);
    // shrink-0 only keeps the real trigger from shrinking in the row; it does not change the measured width.
    const classes = (el: Element) => el.className.split(/\s+/).filter(c => c !== 'shrink-0').sort().join(' ');
    for (const copy of copies) expect(classes(copy)).toBe(classes(trigger));
    const chip = bar().querySelector('[data-measure-key="target"] button');
    expect(trigger).toHaveClass('border-border-control', 'hover:border-border-control');
    expect(chip).toHaveClass('border-border-control', 'hover:border-border-control');
  });

  it('keeps unapplied room drafts through inline → overflow → inline and restores connected bar focus (UIUX-56-02)', async () => {
    mount();
    fireEvent.click(within(bar()).getByRole('button', { name: '대상 전체' }));
    await screen.findByRole('button', { name: '조건 적용 · 2대' });
    fireEvent.click(screen.getByRole('button', { name: /StGroup 전체/ }));
    fireEvent.click(screen.getByRole('button', { name: 'st-01만 선택' }));
    for (const nextWidth of [350, 2000]) {
      width(nextWidth);
      expect(screen.getByRole('checkbox', { name: 'st-01' })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: 'st-02' })).not.toBeChecked();
      expect(new URLSearchParams(window.location.search).has('equipmentGroup')).toBe(false);
    }
    fireEvent.click(screen.getAllByRole('button', { name: '취소' })[0]);
    await vi.waitFor(() => expect(bar().contains(document.activeElement)).toBe(true));
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
    expect(within(bar()).getByRole('button', { name: '기간: 09-25 09:00 → 09-26 09:00 (24h), 참조만' })).toBeVisible();
    cleanup();
    mount('', 'ko', true, registryWith({ ...caps, time: 'unsupported' }));
    expect(within(bar()).getByRole('group', { name: '기간: 09-25 09:00 → 09-26 09:00 (24h), 이 화면에서 미사용' })).toBeVisible();
    cleanup();
    mount('', 'ko', true, registryWith({ ...caps, time: 'apply' }));
    expect(within(bar()).getByRole('button', { name: '기간: 09-25 09:00 → 09-26 09:00 (24h)' })).toBeVisible();
  });

  it('measures once and responds to window resize when ResizeObserver is unavailable (P3-3)', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    mount();
    expect(inlineKeys()).toHaveLength(2);
    act(() => { barWidth = 350; window.dispatchEvent(new Event('resize')); });
    expect(within(bar()).getByRole('button', { name: '조건 1개 더' })).toBeVisible();
  });

  it('uses fractional available width at an exact fit boundary (P3-4)', () => {
    barWidth = 725.6; mount(); // Label-free full controls need 726px; rounded clientWidth would admit them.
    expect(within(bar()).queryByRole('radio', { name: '1일' })).toBeNull();
  });

});
describe('Context 막대 그리기 조건 (#1944 4번)', () => {
  const allUnsupported = Object.fromEntries(Object.keys(caps).map(k => [k, 'unsupported'])) as Record<keyof typeof caps, Capability>;

  it('모든 키가 미지원인 화면은 값이 있어도 막대를 그리지 않고 값은 URL에 남는다', () => {
    mount('&roomNames=PHOTO', 'ko', true, registryWith(allUnsupported));
    expect(screen.queryByRole('region', { name: '전역 Context' })).toBeNull();
    // Values stay in the URL (06 §6.4): nothing is dropped when the bar is hidden.
    expect(new URLSearchParams(window.location.search).get('roomNames')).toBe('PHOTO');
    expect(new URLSearchParams(window.location.search).get('from')).toBe('2026-09-25T09:00:00');
  });

  it('지원 키가 있는 화면으로 돌아가면 같은 값이 다시 보인다', () => {
    mount('&roomNames=PHOTO', 'ko', true, registryWith(allUnsupported));
    expect(screen.queryByRole('region', { name: '전역 Context' })).toBeNull();
    cleanup();
    mount('&roomNames=PHOTO');
    expect(within(bar()).getByRole('button', { name: /대상 조건 · 지금 .*공정: PHOTO/ })).toBeVisible();
  });
});


describe('현재 조건 공유 reports success only after the clipboard write (#300)', () => {
  const SUCCESS = '현재 적용된 조건의 링크를 복사했습니다. 편집 중인 변경은 제외됩니다.';
  const FAILURE = '현재 조건 링크를 복사하지 못했습니다.';

  afterEach(() => {
    Reflect.deleteProperty(window, 'isSecureContext');
    Reflect.deleteProperty(navigator, 'clipboard');
    Reflect.deleteProperty(document, 'execCommand');
  });

  function ToastProbe() {
    const toasts = useToastsForTest();
    return <div data-testid="toast-probe">{toasts.map(toast => <p key={toast.id}>{toast.tone}:{toast.text}</p>)}</div>;
  }

  function mountWithToasts() {
    localStorage.setItem('platform:lang', 'ko');
    window.history.replaceState(null, '', '/?v=1&scopeId=MEM&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00');
    return render(<I18nProvider><PlatformProvider equipmentAxes={equipmentAxes} adapter={adapter} registry={registry}><GlobalContextBar /><ToastProbe /></PlatformProvider></I18nProvider>);
  }

  const copyLink = () => within(bar()).getByRole('button', { name: '현재 조건 공유' });
  const toasts = () => screen.getByTestId('toast-probe').textContent ?? '';

  it('insecure environment (no clipboard, execCommand refuses): warning with cause and action, never the success toast', async () => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false });
    Reflect.deleteProperty(navigator, 'clipboard');
    Object.defineProperty(document, 'execCommand', { configurable: true, value: () => false });
    mountWithToasts();
    fireEvent.click(copyLink());
    await vi.waitFor(() => expect(toasts()).toContain(FAILURE));
    expect(toasts()).not.toContain(SUCCESS);
  });

  it('success toast only after writeText resolves; the copy carries origin + the platform url', async () => {
    let release: (() => void) | undefined;
    const writeText = vi.fn((_text: string) => new Promise<void>(resolve => { release = () => resolve(); }));
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    mountWithToasts();
    fireEvent.click(copyLink());
    expect(writeText).toHaveBeenCalledTimes(1);
    const written = String(writeText.mock.calls[0]?.[0]);
    expect(written.startsWith(window.location.origin)).toBe(true);
    expect(written).toContain('scopeId=MEM');
    expect(toasts()).toBe(''); // quiet while the write is pending
    act(() => { release?.(); });
    await vi.waitFor(() => expect(toasts()).toContain(SUCCESS));
    expect(toasts()).not.toContain(FAILURE);
  });

});

describe('Target dialog replaces the single-axis editor (#301, #552)', () => {
  it('applies an axis rule while fixed Selection survives, and cancel preserves the committed rule', async () => {
    mount('&selectedEquipmentIds=E1');
    fireEvent.click(within(bar()).getByRole('button', { name: /대상 고정 1대/ }));
    await screen.findByRole('button', { name: '고정 1대 적용' });
    fireEvent.click(screen.getByRole('button', { name: /StGroup 전체/ }));
    fireEvent.click(screen.getByRole('button', { name: 'st-02만 선택' }));
    expect(screen.getByRole('button', { name: '적용', busy: true })).toBeDisabled();
    expect(new URLSearchParams(window.location.search).has('equipmentGroup')).toBe(false);
    fireEvent.click(await screen.findByRole('button', { name: '고정 1대 적용' }));
    expect(new URLSearchParams(window.location.search).get('equipmentGroup')).toBe('{"stgroup":["st-02"]}');
    expect(new URLSearchParams(window.location.search).get('selectedEquipmentIds')).toBe('E1');
    fireEvent.click(within(bar()).getByRole('button', { name: /대상 고정 1대/ }));
    expect(screen.getByRole('checkbox', { name: 'st-02' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'st-01만 선택' }));
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(new URLSearchParams(window.location.search).get('equipmentGroup')).toBe('{"stgroup":["st-02"]}');
  });
  it('edits multiple axes together and clears the entire target without opening', async () => {
    mount(`&equipmentGroup=${encodeURIComponent(JSON.stringify({ stgroup: ['st-01', 'st-02'], team: ['T1'] }))}&selectedEquipmentIds=E1`);
    fireEvent.click(within(bar()).getByRole('button', { name: /대상 고정/ }));
    expect(await screen.findByRole('checkbox', { name: 'T1' })).toBeChecked();
    fireEvent.click(screen.getAllByRole('button', { name: '취소' })[0]);
    fireEvent.click(within(bar()).getByRole('button', { name: '대상 지우기' }));
    expect(new URLSearchParams(window.location.search).has('equipmentGroup')).toBe(false);
    expect(new URLSearchParams(window.location.search).has('selectedEquipmentIds')).toBe(false);
  });
});

const equipmentAxes = [
  { id: 'stgroup', label: { ko: 'StGroup', en: 'StGroup' }, membershipHistory: false },
  { id: 'team', label: { ko: '분임조', en: 'Team' }, membershipHistory: false },
  { id: 'maker', label: { ko: 'Maker', en: 'Maker' }, membershipHistory: false },
  { id: 'model', label: { ko: 'Model', en: 'Model' }, membershipHistory: false, dependsOn: 'maker' },
];

describe('Maker+Model map compatibility (#552)', () => {
  it('reopens the v1 pair with the same checked option and writes the split map', async () => {
    mount(`&equipmentGroup=${encodeURIComponent(JSON.stringify({ axis: 'makerModel', maker: 'X', model: 'Y' }))}&selectedEquipmentIds=E1`);
    fireEvent.click(within(bar()).getByRole('button', { name: /대상 고정 1대/ }));
    expect(await screen.findByRole('checkbox', { name: 'X' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Y' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: '고정 1대 적용' }));
    expect(new URLSearchParams(window.location.search).get('equipmentGroup')).toBe('{"maker":["X"],"model":["Y"]}');
    expect(new URLSearchParams(window.location.search).get('selectedEquipmentIds')).toBe('E1');
  });
  it('shows carried Line and PRC and removes an orphaned basis with the last PRC group', () => {
    mount('&lineNames=L&prcGroups=P&membershipBasis=asOf');
    expect(within(bar()).getAllByText('L').some(el => !el.closest('[data-context-measuring]'))).toBe(true);
    expect(within(bar()).getAllByText('P · 그 시점 소속').some(el => !el.closest('[data-context-measuring]'))).toBe(true);
    const remove = within(bar()).getByRole('button', { name: '지우기 PRC 그룹' });
    fireEvent.click(remove);
    expect(new URLSearchParams(window.location.search).has('membershipBasis')).toBe(false);
    expect(new URLSearchParams(window.location.search).get('lineNames')).toBe('L');
  });
});

describe('lossless legacy pair values (#552)', () => {
  it('keeps both IDs when different pairs have the same display label', async () => {
    const pairAdapter = testAdapter({ ...adapter, listEquipmentFacts: async () => ({ version: 'pair', items: [
      { equipmentId: 'E1', room: 'PHOTO', axes: { maker: ['X / Y'], model: ['Z'] } },
      { equipmentId: 'E2', room: 'PHOTO', axes: { maker: ['X'], model: ['Y / Z'] } },
    ] }) });
    mount(`&equipmentGroup=${encodeURIComponent(JSON.stringify({ maker: ['X'], model: ['Y / Z'] }))}`, 'ko', true, registry, pairAdapter);
    fireEvent.click(within(bar()).getByRole('button', { name: /대상 조건/ }));
    expect(await screen.findByRole('checkbox', { name: 'Y / Z' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: '조건 적용 · 1대' }));
    expect(new URLSearchParams(window.location.search).get('equipmentGroup')).toBe('{"maker":["X"],"model":["Y / Z"]}');
  });
});

describe('no server anchor: defaultRangeTo is null (ADR-0098)', () => {
  const noAnchor = testAdapter({ ...adapter, defaultRangeTo: () => null });
  const today = new Date().toISOString().slice(0, 4);

  it('turns the relative presets off but keeps an explicit period readable', () => {
    mount('', 'ko', true, registry, noAnchor);
    const period = within(bar()).getByRole('button', { name: /^기간:/ });
    expect(period).toHaveAttribute('title', '기간: 09-25 09:00 → 09-26 09:00 (24h)');
    for (const name of ['1일', '7일']) expect(within(bar()).getByRole('radio', { name })).toBeDisabled();
  });

  it('does not write a period when a disabled preset is pressed', () => {
    mount('', 'ko', false, registry, noAnchor);
    fireEvent.click(within(bar()).getByRole('radio', { name: '1일' }));
    expect(window.location.search).not.toMatch(/from=/);
  });

  it('opens the custom editor blank: no browser-clock or invented date', () => {
    mount('', 'ko', false, registry, noAnchor);
    fireEvent.click(within(bar()).getByRole('button', { name: /^기간:/ }));
    const dialog = screen.getByRole('dialog');
    for (const input of Array.from(dialog.querySelectorAll('input[type="date"]'))) expect((input as HTMLInputElement).value).toBe('');
    expect(dialog.textContent ?? '').not.toContain(today);
    expect(within(bar()).getByRole('radio', { name: '1일' })).toBeDisabled();
  });
});
