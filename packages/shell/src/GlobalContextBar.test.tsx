import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry, usePlatform } from '@ap/kernel';
import { GlobalContextBar } from './GlobalContextBar';
import { memoryStorage, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId, type Capability } from '@ap/contracts';

const caps = { time: 'reference', roomNames: 'apply', line: 'unsupported', prcGroup: 'unsupported', condition: 'apply', selection: 'apply', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' } as const;
const registryWith = (context: Record<keyof typeof caps, Capability>) => createRegistry({
  spaces: [testSpace()],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('analytics') }],
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
  window.history.replaceState(null, '', `/?v=1&scopeId=MEM${period ? '&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00' : ''}${extra}`);
  return render(<I18nProvider><PlatformProvider equipmentAxes={equipmentAxes} adapter={adapter} registry={menus}><GlobalContextBar /></PlatformProvider></I18nProvider>);
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
    fireEvent.click(within(popover).getByRole('button', { name: '설비 선택 빈 선택' }));
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

  it('reopens the custom range editor when the applied custom preset is pressed again (#228 review)', async () => {
    mount('&from=2026-09-22T09:00:00&to=2026-09-24T09:00:00', 'ko', false);
    const custom = within(bar()).getByRole('radio', { name: '사용자 지정' });
    expect(custom).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(custom);
    expect(await screen.findByText('시작일')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    await vi.waitFor(() => expect(screen.queryByText('시작일')).toBeNull());
    fireEvent.click(within(bar()).getByRole('radio', { name: '사용자 지정' }));
    expect(await screen.findByText('시작일')).toBeVisible();
  });

  // Measurement parity: the inert copies must render exactly like the real trigger or the overflow math drifts.
  // UIUX-56-01 / #240: the trigger is one more Context chip, so it shares the neighbouring chips' border.
  it('renders the overflow trigger and every measurement copy as a Context chip with the same classes', () => {
    barWidth = 450; mount();
    const trigger = within(bar()).getByRole('button', { name: '조건 3개 더' });
    const copies = Array.from(bar().querySelectorAll('[data-measure-overflow]'));
    expect(copies.length).toBeGreaterThan(0);
    // shrink-0 only keeps the real trigger from shrinking in the row; it does not change the measured width.
    const classes = (el: Element) => el.className.split(/\s+/).filter(c => c !== 'shrink-0').sort().join(' ');
    for (const copy of copies) expect(classes(copy)).toBe(classes(trigger));
    const chip = bar().querySelector('[data-measure-key="roomNames"] button');
    expect(trigger).toHaveClass('border-border-strong', 'hover:border-border-control');
    expect(chip).toHaveClass('border-border-strong', 'hover:border-border-control');
  });

  it('keeps unapplied room drafts through inline → overflow → inline and restores connected bar focus (UIUX-56-02)', async () => {
    mount();
    fireEvent.click(within(bar()).getByRole('button', { name: 'room_name 전체' }));
    fireEvent.click(screen.getByRole('radio', { name: '명시 선택' }));
    const checkbox = await screen.findByRole('checkbox', { name: 'PHOTO' });
    fireEvent.click(checkbox);
    checkbox.focus();
    for (const nextWidth of [450, 2000]) {
      width(nextWidth);
      await vi.waitFor(() => expect(screen.getByRole('checkbox', { name: 'PHOTO' })).toBeChecked());
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

describe('링크 복사 reports success only after the clipboard write (#300)', () => {
  const SUCCESS = '현재 Context가 담긴 링크를 복사했습니다. 받는 사람의 권한으로 서버가 다시 검증합니다.';
  const FAILURE = '링크를 복사하지 못했습니다. 주소창의 주소를 직접 복사하세요.';

  afterEach(() => {
    Reflect.deleteProperty(window, 'isSecureContext');
    Reflect.deleteProperty(navigator, 'clipboard');
    Reflect.deleteProperty(document, 'execCommand');
  });

  function ToastProbe() {
    const { toasts } = usePlatform();
    return <div data-testid="toast-probe">{toasts.map(toast => <p key={toast.id}>{toast.tone}:{toast.text}</p>)}</div>;
  }

  function mountWithToasts() {
    localStorage.setItem('platform:lang', 'ko');
    window.history.replaceState(null, '', '/?v=1&scopeId=MEM&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00');
    return render(<I18nProvider><PlatformProvider equipmentAxes={equipmentAxes} adapter={adapter} registry={registry}><GlobalContextBar /><ToastProbe /></PlatformProvider></I18nProvider>);
  }

  const copyLink = () => within(bar()).getByRole('button', { name: '링크 복사' });
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

describe('Condition editor exposes choices as a radio group (#301)', () => {
  // Two distinct StGroups so the keyboard branch and checked state have something to land on.
  const conditionAdapter = testAdapter({
    session: () => session,
    validateScope: async () => ({ status: 'valid', scopeId: 'MEM', grantedRooms: ['PHOTO'] }),
    contextOptions: async () => ({ stgroup: ['st-01', 'st-02'], team: [], makerModel: [] }),
    evaluateSelection: evaluation,
    getEntity: async () => forbidden,
    listAnnotations: async () => forbidden,
  });
  const mountCondition = (condition: string | null) => {
    localStorage.setItem('platform:lang', 'ko');
    window.history.replaceState(null, '', `/?v=1&scopeId=MEM&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00&selectedEquipmentIds=E1${condition ? `&equipmentGroup=${encodeURIComponent(condition)}` : ''}`);
    return render(<I18nProvider><PlatformProvider equipmentAxes={equipmentAxes} adapter={conditionAdapter} registry={registry}><GlobalContextBar /></PlatformProvider></I18nProvider>);
  };
  const openConditionEditor = async () => {
    fireEvent.click(within(bar()).getByRole('button', { name: /설비 그룹 조건/ }));
    return await screen.findByRole('radiogroup', { name: 'StGroup' });
  };
  const url = () => new URLSearchParams(window.location.search);

  // Radix timing (react-radio-group 1.4.7): document keydown marks the arrow key, roving focus moves focus in a
  // setTimeout, and the item's focus handler clicks it only while the arrow key is still held. Assert after the
  // async settle, then send keyup — no synchronous focus bypass.
  it('ArrowDown moves focus and checked to the second option; 적용 commits while the fixed Selection survives', async () => {
    mountCondition(null);
    await openConditionEditor();
    const first = screen.getByRole('radio', { name: 'st-01' });
    const second = screen.getByRole('radio', { name: 'st-02' });
    expect(first).not.toBeChecked();
    expect(second).not.toBeChecked();
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    await vi.waitFor(() => expect(second).toHaveFocus());
    await vi.waitFor(() => expect(second).toBeChecked());
    fireEvent.keyUp(second, { key: 'ArrowDown' });
    // Draft only: the applied chip and URL still carry no condition.
    expect(within(bar()).getByRole('button', { name: '설비 그룹 조건 없음' })).toBeVisible();
    expect(url().has('equipmentGroup')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '적용' }));
    await vi.waitFor(() => expect(url().get('equipmentGroup')).toBe('{"stgroup":["st-02"]}'));
    expect(within(bar()).getByRole('button', { name: '설비 그룹 조건 StGroup: st-02' })).toBeVisible();
    expect(url().get('selectedEquipmentIds')).toBe('E1');
  });

  it('marks the applied condition checked and keeps it on 취소', async () => {
    mountCondition('{"axis":"stgroup","id":"st-01"}');
    await openConditionEditor();
    expect(screen.getByRole('radio', { name: 'st-01' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'st-02' }));
    expect(screen.getByRole('radio', { name: 'st-01' })).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    await vi.waitFor(() => expect(screen.queryByRole('radiogroup', { name: 'StGroup' })).toBeNull());
    expect(url().get('equipmentGroup')).toBe('{"axis":"stgroup","id":"st-01"}');
  });

  it('지우기 removes the condition and keeps the fixed Selection', async () => {
    mountCondition('{"axis":"stgroup","id":"st-01"}');
    await openConditionEditor();
    fireEvent.click(screen.getByRole('button', { name: '지우기' }));
    await vi.waitFor(() => expect(url().has('equipmentGroup')).toBe(false));
    expect(url().get('selectedEquipmentIds')).toBe('E1');
    expect(within(bar()).getByRole('button', { name: '설비 그룹 조건 없음' })).toBeVisible();
  });
});

describe('multi-axis summary compatibility (#552)', () => {
  it('shows descriptor labels and offers only Clear for a condition the legacy editor cannot represent', async () => {
    mount(`&equipmentGroup=${encodeURIComponent(JSON.stringify({ stgroup: ['A', 'B'], team: ['T1'] }))}`);
    const chip = within(bar()).getByRole('button', { name: /설비 그룹 조건 StGroup: A, B · 분임조: T1/ });
    fireEvent.click(chip);
    expect(await screen.findByRole('button', { name: '지우기' })).toBeVisible();
    expect(screen.queryByRole('button', { name: '적용' })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'StGroup' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '지우기' }));
    expect(new URLSearchParams(window.location.search).has('equipmentGroup')).toBe(false);
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
    const choices = vi.spyOn(adapter, 'contextOptions').mockResolvedValue({ stgroup: [], team: [], makerModel: [{ maker: 'X', model: 'Y' }] });
    mount(`&equipmentGroup=${encodeURIComponent(JSON.stringify({ axis: 'makerModel', maker: 'X', model: 'Y' }))}&selectedEquipmentIds=E1`);
    fireEvent.click(within(bar()).getByRole('button', { name: /설비 그룹 조건 Maker: X · Model: Y/ }));
    expect(await screen.findByRole('radio', { name: 'X / Y' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: '적용' }));
    expect(new URLSearchParams(window.location.search).get('equipmentGroup')).toBe('{"maker":["X"],"model":["Y"]}');
    expect(new URLSearchParams(window.location.search).get('selectedEquipmentIds')).toBe('E1');
    choices.mockRestore();
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
    vi.spyOn(adapter, 'contextOptions').mockResolvedValue({ stgroup: [], team: [], makerModel: [{ maker: 'X / Y', model: 'Z' }, { maker: 'X', model: 'Y / Z' }] });
    mount(`&equipmentGroup=${encodeURIComponent(JSON.stringify({ maker: ['X'], model: ['Y / Z'] }))}`);
    fireEvent.click(within(bar()).getByRole('button', { name: /설비 그룹 조건 Maker: X · Model: Y \/ Z/ }));
    await screen.findAllByRole('radio', { name: 'X / Y / Z' });
    fireEvent.click(screen.getByRole('button', { name: '적용' }));
    expect(new URLSearchParams(window.location.search).get('equipmentGroup')).toBe('{"maker":["X"],"model":["Y / Z"]}');
  });
});
