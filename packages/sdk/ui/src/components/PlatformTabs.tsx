// ADR-0023 개정(#340): 목록·트리거만 플랫폼 선택 표식을 정의한다.
// 역할·선택·키보드 동작은 같은 패키지의 shadcn 탭(원래 FeedbackOps 원본)을 그대로 사용한다.
import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../utils/cn.js';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from './shadcn/dropdown-menu.js';
import { TabsList as BaseTabsList, TabsTrigger as BaseTabsTrigger } from './shadcn/tabs.js';

// 선택 표식의 공통 부분. 트리거(data-[state=active])와 더보기 버튼(data-[selected])이 같은 막대를 쓰도록 선택자와 무관한 클래스를 한 곳에 둔다.
const TAB_MARK_BASE = 'after:absolute after:inset-x-3 after:bottom-0 after:hidden after:h-0.5 after:rounded-pill after:bg-accent-primary forced-colors:after:bg-transparent forced-colors:after:border-b-2 forced-colors:after:border-current';
const LIST_BASE = 'flex h-auto w-full items-end justify-start rounded-none bg-transparent p-0 text-text-secondary';
// eslint-disable-next-line shadcn/no-arbitrary-values -- 기준선을 inset shadow로 그려 선택 막대가 덮고 스크롤 목록에 1px 세로 넘침이 없게, #340
const LIST_BASELINE = 'shadow-[inset_0_-1px_0_var(--color-border-subtle)]';
// 고대비(forced-colors)에서 inset shadow가 지워지므로 1px 전경색 아래 테두리로 기준선을 남긴다. #340
const LIST_BASELINE_FORCED = 'forced-colors:border-b forced-colors:border-current';

export type TabsListProps = React.ComponentPropsWithoutRef<typeof BaseTabsList> & {
  /**
   * `scroll`(기본): 탭이 넘치면 목록이 가로로 스크롤된다.
   * `menu`: 들어가지 않는 탭을 마지막 보이는 탭 바로 뒤의 `더보기` 메뉴로 옮긴다. 선택된 탭은 항상 닿을 수 있다.
   * `menu`는 목록 자신의 상자 너비를 재므로 컨테이너가 확정된 너비를 줘야 한다(flex 행이면 `min-w-0 flex-1`).
   */
  overflow?: 'scroll' | 'menu';
  /** `overflow="menu"` 버튼 이름. `@ap/ui`는 i18n을 모르므로 메뉴가 자기 문구를 넘긴다. */
  moreLabel?: string;
};

export const TabsList = React.forwardRef<React.ElementRef<typeof BaseTabsList>, TabsListProps>(
  ({ className, overflow = 'scroll', moreLabel = '더보기', ...props }, ref) => {
    if (overflow === 'menu') return <MenuTabsList ref={ref} className={className} moreLabel={moreLabel} {...props} />;
    return (
      <BaseTabsList
        ref={ref}
        className={cn(
          LIST_BASE,
          'overflow-x-auto',
          LIST_BASELINE,
          LIST_BASELINE_FORCED,
          className,
        )}
        {...props}
      />
    );
  },
);
TabsList.displayName = BaseTabsList.displayName;

interface OverflowItem { value: string; label: string; disabled: boolean }
interface OverflowState { items: OverflowItem[]; hidden: string[]; selected: string | null }
const EMPTY_STATE: OverflowState = { items: [], hidden: [], selected: null };

// Radix 트리거 id는 `${base}-trigger-${value}`다. 값은 DOM에서 읽어 tabs 루트가 제어/비제어 어느 쪽이든 value prop을 복제하지 않는다.
function triggerValue(el: HTMLElement): string {
  const id = el.id;
  const at = id.indexOf('-trigger-');
  return at >= 0 ? id.slice(at + '-trigger-'.length) : id;
}

// 문자열 트리거의 보이지 않는 굵은 사본(aria-hidden)은 빼고 읽고, 글자가 없으면 aria-label을 쓴다.
function triggerLabel(el: HTMLElement): string {
  let text = '';
  const walk = (node: Node) => {
    node.childNodes.forEach(child => {
      if (child.nodeType === 3) text += child.textContent ?? '';
      else if (child instanceof HTMLElement && child.getAttribute('aria-hidden') !== 'true') walk(child);
    });
  };
  walk(el);
  return text.trim() || el.getAttribute('aria-label') || '';
}

function sameState(a: OverflowState, b: OverflowState): boolean {
  return a.selected === b.selected
    && a.hidden.length === b.hidden.length && a.hidden.every((v, i) => v === b.hidden[i])
    && a.items.length === b.items.length && a.items.every((x, i) => x.value === b.items[i]!.value && x.label === b.items[i]!.label && x.disabled === b.items[i]!.disabled);
}

function prefixThatFits(widths: number[], available: number, reserve: number, limit: number): number {
  let used = 0;
  let count = 0;
  while (count < Math.min(limit, widths.length) && used + widths[count]! + reserve <= available) { used += widths[count]!; count += 1; }
  return count;
}

const MENU_BUTTON_BASE = 'relative inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-none px-3 py-1.5 text-sm font-medium text-text-secondary ring-offset-surface-canvas transition-all hover:text-text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring focus-visible:ring-offset-0 focus-visible:-outline-offset-2';
const MENU_BUTTON_MARK = 'data-[selected]:font-semibold data-[selected]:text-text-primary data-[selected]:after:block';

const MenuTabsList = React.forwardRef<
  React.ElementRef<typeof BaseTabsList>,
  React.ComponentPropsWithoutRef<typeof BaseTabsList> & { moreLabel: string }
>(({ className, moreLabel, ...props }, forwardedRef) => {
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const moreMeasureRef = React.useRef<HTMLSpanElement>(null);
  const selectedMeasureRef = React.useRef<HTMLSpanElement>(null);
  const widths = React.useRef(new Map<string, number>());
  const labels = React.useRef(new Map<string, string>());
  const savedStop = React.useRef<HTMLElement | null>(null);
  const [state, setState] = React.useState<OverflowState>(EMPTY_STATE);
  const stateRef = React.useRef(state);
  stateRef.current = state;

  const setRefs = React.useCallback((node: HTMLDivElement | null) => {
    listRef.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
  }, [forwardedRef]);

  // 트리거 폭을 재고(보이는 동안 값별로 캐시), 들어가지 않는 뒤쪽 탭에 hidden을 건다. 크기·탭 집합·선택이 바뀔 때만 다시 돈다.
  const recompute = React.useCallback(() => {
    const wrapper = wrapperRef.current;
    const list = listRef.current;
    if (wrapper === null || list === null) return;
    const triggers = Array.from(list.querySelectorAll<HTMLElement>('[role="tab"]'));
    const entries = triggers.map(el => ({ el, value: triggerValue(el), label: triggerLabel(el), disabled: el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true' }));
    for (const { el, value, label } of entries) {
      // 글자가 바뀌면 옛 폭을 버리고 다시 잰다. 숨은 트리거는 잠깐 펼쳐 재고 되돌린다(같은 동기 구간이라 그려지지 않는다).
      const labelChanged = labels.current.get(value) !== label;
      labels.current.set(value, label);
      if (labelChanged) widths.current.delete(value);
      const wasHidden = el.hidden;
      if (wasHidden && !widths.current.has(value)) el.hidden = false;
      const width = el.hidden ? 0 : el.getBoundingClientRect().width;
      el.hidden = wasHidden;
      if (width > 0) widths.current.set(value, width);
    }
    const selected = entries.find(({ el }) => el.getAttribute('data-state') === 'active')?.value ?? null;
    const available = wrapper.getBoundingClientRect().width;
    const tabWidths = entries.map(({ value }) => widths.current.get(value) ?? 0);
    let hidden: string[] = [];
    if (available > 0 && tabWidths.reduce((a, b) => a + b, 0) > available) {
      const moreWidth = moreMeasureRef.current?.getBoundingClientRect().width ?? 0;
      const selectedWidth = selectedMeasureRef.current?.getBoundingClientRect().width ?? 0;
      const selectedIndex = entries.findIndex(({ value }) => value === selected);
      let count = prefixThatFits(tabWidths, available, moreWidth, entries.length);
      if (selectedIndex >= count) count = prefixThatFits(tabWidths, available, Math.max(selectedWidth, moreWidth), selectedIndex);
      hidden = entries.slice(count).map(({ value }) => value);
    }
    const hiddenSet = new Set(hidden);
    for (const { el, value } of entries) el.hidden = hiddenSet.has(value);
    // 선택된 탭이 숨으면 보이는 탭의 롤링 Tab 정거장(tabindex=0)을 모두 -1로 눌러 더보기 버튼만 남긴다. 다시 보이면 마지막 정거장을 되돌린다.
    const selectedIsHidden = selected !== null && hiddenSet.has(selected);
    for (const { el } of entries) {
      if (el.hidden) continue;
      if (selectedIsHidden) {
        if (el.getAttribute('tabindex') !== '-1') { savedStop.current = el; el.setAttribute('tabindex', '-1'); }
      }
    }
    if (!selectedIsHidden && savedStop.current !== null) {
      const stop = savedStop.current;
      savedStop.current = null;
      if (stop.isConnected && !stop.hidden && entries.every(({ el }) => el.getAttribute('tabindex') !== '0')) stop.setAttribute('tabindex', '0');
    }
    const next: OverflowState = { items: entries.map(({ value, label, disabled }) => ({ value, label, disabled })), hidden, selected };
    if (!sameState(stateRef.current, next)) setState(next);
  }, []);

  React.useLayoutEffect(() => { recompute(); });
  React.useEffect(() => {
    const wrapper = wrapperRef.current;
    const list = listRef.current;
    if (wrapper === null || list === null) return undefined;
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => recompute());
    resize?.observe(wrapper);
    const mutation = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => recompute());
    mutation?.observe(list, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-state', 'disabled', 'aria-disabled', 'aria-label', 'tabindex'] });
    return () => { resize?.disconnect(); mutation?.disconnect(); };
  }, [recompute]);

  const hiddenItems = state.items.filter(item => state.hidden.includes(item.value));
  const selectedItem = state.items.find(item => item.value === state.selected);
  const selectedHidden = selectedItem !== undefined && state.hidden.includes(selectedItem.value);
  const buttonLabel = selectedHidden ? selectedItem.label : moreLabel;

  // 숨은 탭은 DOM에 둔 채 hidden으로 접근성 트리에서 뺀다(TabsContent aria-labelledby가 계속 풀린다). 선택은 Radix 루트의 mousedown 경로로 한다.
  const choose = (value: string) => {
    const target = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]') ?? []).find(el => triggerValue(el) === value);
    target?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
  };

  // Radix 롤링 포커스는 더보기 버튼을 모르므로 숨은 탭이 있을 때 [보이는 탭…, 더보기] 순서를 직접 돈다.
  const onKeyDownCapture = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (stateRef.current.hidden.length === 0 || event.defaultPrevented) return;
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
    const button = buttonRef.current;
    const stops: HTMLElement[] = [
      ...Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]') ?? []).filter(el => !el.hidden && !el.hasAttribute('disabled')),
      ...(button === null ? [] : [button]),
    ];
    const current = stops.findIndex(el => el === event.target || el.contains(event.target as Node));
    if (current < 0) return;
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? stops.length - 1
        : event.key === 'ArrowRight' ? Math.min(current + 1, stops.length - 1)
          : Math.max(current - 1, 0);
    event.preventDefault();
    stops[next]?.focus();
  };

  return (
    <div ref={wrapperRef} className={cn(LIST_BASE, 'relative', LIST_BASELINE, LIST_BASELINE_FORCED, className)} onKeyDownCapture={onKeyDownCapture}>
      <BaseTabsList
        ref={setRefs}
        // 선택된 탭이 숨었으면 목록 루트가 Tab으로 첫 보이는 탭을 잡아 선택을 바꾸지 않도록 더보기 버튼만 Tab 정거장으로 둔다.
        tabIndex={selectedHidden ? -1 : undefined}
        className="flex h-auto min-w-0 items-end justify-start overflow-hidden rounded-none bg-transparent p-0 text-text-secondary"
        {...props}
      />
      {state.hidden.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              ref={buttonRef}
              type="button"
              tabIndex={selectedHidden ? 0 : -1}
              aria-label={selectedHidden ? `${moreLabel}: ${buttonLabel}` : undefined}
              data-selected={selectedHidden ? '' : undefined}
              className={cn(MENU_BUTTON_BASE, TAB_MARK_BASE, MENU_BUTTON_MARK)}
            >
              {buttonLabel}
              <ChevronDown aria-hidden className="size-4 shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuRadioGroup value={selectedHidden ? state.selected! : ''} onValueChange={choose}>
              {hiddenItems.map(item => <DropdownMenuRadioItem key={item.value} value={item.value} disabled={item.disabled}>{item.label}</DropdownMenuRadioItem>)}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <div aria-hidden className="pointer-events-none invisible absolute left-0 top-0 h-0 overflow-hidden whitespace-nowrap">
        <span ref={moreMeasureRef} className="inline-flex gap-1 px-3 text-sm font-medium">{moreLabel}<ChevronDown className="size-4 shrink-0" /></span>
        <span ref={selectedMeasureRef} className="inline-flex gap-1 px-3 text-sm font-semibold">{selectedItem?.label ?? ''}<ChevronDown className="size-4 shrink-0" /></span>
      </div>
    </div>
  );
});
MenuTabsList.displayName = 'MenuTabsList';

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof BaseTabsTrigger>,
  React.ComponentPropsWithoutRef<typeof BaseTabsTrigger>
>(({ className, children, ...props }, ref) => (
  <BaseTabsTrigger
    ref={ref}
    className={cn(
      'relative shrink-0 rounded-none text-text-secondary hover:text-text-primary focus-visible:ring-inset focus-visible:ring-offset-0 focus-visible:-outline-offset-2 data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-text-primary data-[state=active]:shadow-none',
      // 선택 막대는 트리거 자신의 ::after로 그린다. 자식 형제 요소를 두면 Radix asChild 슬롯이
      // 단일 요소 자식을 요구해 렌더가 깨진다(#340 F1). 고대비에서는 막대를 전경색 테두리로 남긴다.
      TAB_MARK_BASE,
      'data-[state=active]:after:block',
      className,
    )}
    {...props}
  >
    {typeof children === 'string' || typeof children === 'number' ? (
      <span className="grid">
        <span aria-hidden className="invisible col-start-1 row-start-1 font-semibold whitespace-nowrap">{children}</span>
        <span className="col-start-1 row-start-1">{children}</span>
      </span>
    ) : children}
  </BaseTabsTrigger>
));
TabsTrigger.displayName = BaseTabsTrigger.displayName;
