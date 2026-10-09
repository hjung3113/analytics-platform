/**
 * W-230 PROTOTYPE (throwaway) — three structurally different collapsed states for the page filter row of
 * CycleTimeDrilldown, on the real route, switchable via `?variant=A|B|C` (default A). Per
 * `.agents/skills/prototype/UI.md` (sub-shape A): variants and the switcher are discarded once a winner is
 * confirmed; `PageFilterBar` itself is untouched and the collapsed state wraps it from the menu side.
 *
 * A — value-list one-line header (Fiori style): collapsed = thin header row with chevron toggle + text summary
 *     `필터 · 시간 · ≥ P95 · 사이클타임 내림차순` (more than 3 values → `…`); clicking the header expands.
 *     Expanded = today's PageFilterBar as-is under a chevron header.
 * B — icon toggle + count badge (Looker/Carbon style): collapsed = one filter icon button + `필터 3` badge +
 *     `· 변경 n` for values differing from the page defaults; values live only in the title tooltip.
 *     Expanded = PageFilterBar row with a collapse icon at its end.
 * C — read-only chip strip: collapsed = non-button chips `집계: 시간` `꼬리: ≥ P95` `정렬: …` + `편집` (expands);
 *     when the strip is too narrow it ends with `+n`. Expanded = PageFilterBar row with a collapse action.
 *
 * Collapse state is a UI preference remembered per menu in localStorage (AnalysisLayout precedent, try/catch);
 * filter VALUES stay owned by the URL. Default is expanded. Focus follows the toggle into the new state
 * (pendingFocus pattern). All three variants keep 페이지 조건 기본값 (the page's reset action) reachable while
 * collapsed. Bucket/bin chips and the description paragraph below the bar are not collapse targets.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Filter } from 'lucide-react';
import { useI18n, usePlatform } from '@ap/kernel';
import { PageFilterBar, useStoredBoolean, type PageFilterField } from '@ap/components';
import { Button, cn, isProductionEnv } from '@ap/ui';
import { encodeSort, type SortColumn } from '../cycleData';
import type { Granularity, TailMode } from '../../endpoints';

const PROD = isProductionEnv(import.meta as { env?: { PROD?: boolean } }, globalThis as { process?: { env?: { NODE_ENV?: string } } });

type VariantKey = 'A' | 'B' | 'C';

const VARIANTS: { key: VariantKey; name: { ko: string; en: string } }[] = [
  { key: 'A', name: { ko: '값 나열 한 줄 헤더', en: 'One-line value header' } },
  { key: 'B', name: { ko: '아이콘 + 개수 배지', en: 'Icon + count badge' } },
  { key: 'C', name: { ko: '읽기 전용 칩 스트립', en: 'Read-only chip strip' } },
];

const GRAIN_LABEL: Record<Granularity, { ko: string; en: string }> = {
  hour: { ko: '시간', en: 'Hour' },
  day: { ko: '일', en: 'Day' },
  week: { ko: '주', en: 'Week' },
};

/**
 * `?variant=A|B|C` is an unregistered extra: parseQuery keeps it on the URL and setPage/setGlobal preserve it.
 * setPage writes leave the previous pair in the extras when the flag arrived as one, so the last pair wins.
 */
function readVariant(url: string): VariantKey {
  const search = url.includes('?') ? url.slice(url.indexOf('?')) : '';
  const pairs = new URLSearchParams(search).getAll('variant');
  const value = (pairs[pairs.length - 1] ?? 'A').toUpperCase();
  return value === 'B' || value === 'C' ? value : 'A';
}

type SummaryItem = { label: string; value: string };

/**
 * Collapsed summaries read their value labels from the page's own field definitions (no second wording source):
 * grain has no select options, so it maps locally; tail and sort resolve through the select options the page built.
 */
function buildSummaryItems(fields: readonly PageFilterField[], ko: boolean, granularity: Granularity, tailMode: TailMode, sortValue: string): SummaryItem[] {
  const selectValue = (key: string, fallback: string): string => {
    const field = fields.find(candidate => candidate.key === key);
    if (!field || field.kind !== 'select') return fallback;
    return field.options.find(option => option.value === fallback)?.label ?? fallback;
  };
  return [
    { label: ko ? '집계' : 'Grain', value: GRAIN_LABEL[granularity][ko ? 'ko' : 'en'] },
    { label: ko ? '꼬리' : 'Tail', value: selectValue('percentile', tailMode) },
    { label: ko ? '정렬' : 'Sort', value: selectValue('sort', sortValue) },
  ];
}

export type FilterCollapsePrototypeProps = {
  /** The page's own filter-row label (페이지 필터). */
  label: string;
  /** The exact field array the page renders today; the expanded state re-renders it unmodified. */
  fields: readonly PageFilterField[];
  /** The page's reset action (페이지 조건 기본값); rendered in every collapsed state. */
  actions: ReactNode;
  granularity: Granularity;
  grainExplicit: boolean;
  tailMode: TailMode;
  tailExplicit: boolean;
  sortSpec: { id: SortColumn; desc: boolean };
  sortExplicit: boolean;
};

export function FilterCollapsePrototype({ label, fields, actions, granularity, grainExplicit, tailMode, tailExplicit, sortSpec, sortExplicit }: FilterCollapsePrototypeProps) {
  const { route, url } = usePlatform();
  const { lang } = useI18n();
  const ko = lang === 'ko';
  const panelId = useId();
  const variant = readVariant(url);
  // UI preference in per-menu storage (components-owned; URL keeps owning the filter values).
  const [collapsed, toggleCollapsed] = useStoredBoolean(`platform:page-filter-collapsed:${route?.menu.id ?? ''}`);
  const sortValue = encodeSort(sortSpec.id, sortSpec.desc);
  const items = buildSummaryItems(fields, ko, granularity, tailMode, sortValue);
  const changedCount = [grainExplicit, tailExplicit, sortExplicit].filter(Boolean).length;

  // Focus follows the toggle into the new state so collapsing never drops keyboard focus (AnalysisLayout pattern).
  const toggleRefs = useRef<Partial<Record<'collapsed' | 'expanded', HTMLButtonElement | null>>>({});
  const pendingFocus = useRef<'collapsed' | 'expanded' | null>(null);
  useLayoutEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    toggleRefs.current[target]?.focus();
    pendingFocus.current = null;
  });
  const registerToggle = (state: 'collapsed' | 'expanded') => (element: HTMLButtonElement | null) => {
    toggleRefs.current[state] = element;
  };
  // `expanded` is the state the clicked toggle opens into; storage keeps the inverse (collapsed).
  const toggleTo = (expanded: boolean) => {
    pendingFocus.current = expanded ? 'expanded' : 'collapsed';
    toggleCollapsed(!expanded);
  };

  const shared = { collapsed, onToggle: toggleTo, registerToggle, label, fields, actions, panelId, ko, items, fieldCount: fields.length, changedCount };
  if (variant === 'B') return <VariantB {...shared} />;
  if (variant === 'C') return <VariantC {...shared} />;
  return <VariantA {...shared} />;
}

type VariantProps = {
  collapsed: boolean;
  onToggle: (next: boolean) => void;
  registerToggle: (state: 'collapsed' | 'expanded') => (element: HTMLButtonElement | null) => void;
  label: string;
  fields: readonly PageFilterField[];
  actions: ReactNode;
  panelId: string;
  ko: boolean;
  items: SummaryItem[];
  fieldCount: number;
  changedCount: number;
};

/** A — collapsed: one thin header row; the whole header expands, the chevron keeps keyboard toggle. */
function VariantA({ collapsed, onToggle, registerToggle, label, fields, actions, panelId, ko, items }: VariantProps) {
  const values = items.map(item => item.value);
  const summaryText = `${ko ? '필터' : 'Filters'} · ${values.slice(0, 3).join(' · ')}${values.length > 3 ? ' · …' : ''}`;
  const expandAria = ko ? '페이지 필터 줄 펼치기' : 'Expand the page filter row';
  const collapseAria = ko ? '페이지 필터 줄 접기' : 'Collapse the page filter row';
  if (collapsed) {
    return <div id={panelId} className="flex min-w-0 items-center gap-1 rounded-md border border-border-subtle bg-surface-card px-2 py-1.5">
      <button type="button" ref={registerToggle('collapsed')} aria-expanded={false} aria-controls={panelId} aria-label={expandAria}
        className="grid size-6 shrink-0 place-items-center rounded-xs text-text-secondary hover:bg-surface-sunken"
        onClick={event => { event.stopPropagation(); onToggle(true); }}>
        <ChevronDown className="size-3.5" aria-hidden />
      </button>
      {/* The whole header opens; stopPropagation on the toggle avoids the double toggle from the nested click. */}
      <div className="min-w-0 flex-1 cursor-pointer select-none" onClick={() => onToggle(true)}>
        <span className="block truncate text-xs text-text-secondary" title={summaryText}>{summaryText}</span>
      </div>
      {/* Reset stays usable while collapsed; it must not expand the row. */}
      <span onClick={event => event.stopPropagation()}>{actions}</span>
    </div>;
  }
  return <div id={panelId} className="min-w-0 space-y-2">
    <div className="flex items-center gap-1">
      <button type="button" ref={registerToggle('expanded')} aria-expanded aria-controls={panelId} aria-label={collapseAria}
        className="grid size-6 shrink-0 place-items-center rounded-xs text-text-secondary hover:bg-surface-sunken"
        onClick={() => onToggle(false)}>
        <ChevronUp className="size-3.5" aria-hidden />
      </button>
      <span className="text-xs font-medium text-text-secondary">{label}</span>
    </div>
    <PageFilterBar label={label} fields={fields} actions={actions} />
  </div>;
}

/** B — collapsed: minimal-width icon + counts; values live in title/aria only. */
function VariantB({ collapsed, onToggle, registerToggle, label, fields, actions, panelId, ko, items, fieldCount, changedCount }: VariantProps) {
  const valuesText = items.map(item => `${item.label} ${item.value}`).join(', ');
  const expandAria = ko ? `페이지 필터 줄 펼치기: ${valuesText}` : `Expand the page filter row: ${valuesText}`;
  const collapseAria = ko ? '페이지 필터 줄 접기' : 'Collapse the page filter row';
  if (collapsed) {
    return <div id={panelId} className="flex min-w-0 items-center gap-2">
      <button type="button" ref={registerToggle('collapsed')} aria-expanded={false} aria-controls={panelId} aria-label={expandAria} title={valuesText}
        className="grid size-8 shrink-0 place-items-center rounded-md border border-border-control bg-surface-card text-text-secondary hover:bg-surface-sunken"
        onClick={() => onToggle(true)}>
        <Filter className="size-4" aria-hidden />
      </button>
      <span className="shrink-0 rounded-sm bg-surface-sunken px-1.5 py-0.5 text-xs font-medium text-text-secondary tabular">
        {ko ? `필터 ${fieldCount}` : `Filters ${fieldCount}`}
      </span>
      {changedCount > 0 && <span className="shrink-0 text-xs text-text-secondary tabular">{ko ? `· 변경 ${changedCount}` : `· ${changedCount} changed`}</span>}
      <span className="min-w-0 flex-1" />
      {actions}
    </div>;
  }
  return <div id={panelId} className="min-w-0">
    <PageFilterBar label={label} fields={fields} actions={<>
      {actions}
      <Button type="button" variant="ghost" size="icon-sm" ref={registerToggle('expanded')} aria-expanded aria-controls={panelId}
        aria-label={collapseAria} onClick={() => onToggle(false)}>
        <ChevronUp className="size-3.5" aria-hidden />
      </Button>
    </>} />
  </div>;
}

/** C — collapsed: read-only chips; overflow ends with `+n` (widths simulated from one full-layout measurement). */
function VariantC({ collapsed, onToggle, registerToggle, label, fields, actions, panelId, ko, items }: VariantProps) {
  const stripRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const pillRef = useRef<HTMLSpanElement>(null);
  const widthsRef = useRef<number[]>([]);
  const gapRef = useRef(0);
  const keyRef = useRef('');
  const [hiddenCount, setHiddenCount] = useState(0);
  const chipsKey = items.map(item => `${item.label}\n${item.value}`).join('|');

  useLayoutEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const chipEls = items.map((_, index) => chipRefs.current[index]).filter((element): element is HTMLSpanElement => element !== null);
    if (chipEls.length !== items.length) return;
    if (keyRef.current !== chipsKey) {
      // Label/value changed: drop cached widths and let the next pass measure an all-visible layout.
      keyRef.current = chipsKey;
      widthsRef.current = [];
      setHiddenCount(0);
      return;
    }
    if (widthsRef.current.length !== items.length) {
      // Chips never reflow (nowrap, shrink-0), so widths measured once on the all-visible layout stay valid;
      // hidden chips keep their refs via display:none, so a wider strip can recompute from the same cache.
      widthsRef.current = chipEls.map(element => element.offsetWidth);
      gapRef.current = items.length > 1 ? chipEls[1].offsetLeft - chipEls[0].offsetLeft - widthsRef.current[0] : 0;
    }
    const widths = widthsRef.current;
    const gap = gapRef.current;
    const limit = strip.clientWidth;
    let used = 0;
    let fitting = 0;
    for (let index = 0; index < items.length; index++) {
      if (fitting > 0) used += gap;
      if (used + widths[index] > limit) break;
      used += widths[index];
      fitting++;
    }
    let next = items.length - fitting;
    if (next > 0) {
      const pillWidth = pillRef.current?.offsetWidth ?? 44;
      while (fitting > 0 && used + gap + pillWidth > limit) {
        used -= widths[fitting - 1] + (fitting > 1 ? gap : 0);
        fitting--;
      }
      next = items.length - fitting;
    }
    setHiddenCount(next); // same-value updates do not re-render, so this converges.
  });

  if (collapsed) {
    const visibleCount = items.length - hiddenCount;
    return <div id={panelId} className="flex min-w-0 items-center gap-2">
      {/* Chips and the +n pill overflow-hide inside their own box; 편집 and the reset stay outside it. */}
      <div ref={stripRef} className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        {items.map((item, index) => <span key={item.label}
          ref={element => { chipRefs.current[index] = element; }}
          className={cn('inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-sm border border-border-strong bg-surface-card px-2 py-1 text-xs', index >= visibleCount && 'hidden')}>
          <span className="text-text-muted">{item.label}</span>
          <span className="tabular">{item.value}</span>
        </span>)}
        <span ref={pillRef} aria-hidden={hiddenCount === 0}
          className={cn('shrink-0 rounded-sm bg-surface-sunken px-1.5 py-0.5 text-xs text-text-secondary tabular', hiddenCount === 0 && 'invisible')}>
          +{hiddenCount}
        </span>
      </div>
      <Button type="button" variant="secondary" size="toolbar" ref={registerToggle('collapsed')} aria-expanded={false} aria-controls={panelId}
        onClick={() => onToggle(true)}>{ko ? '편집' : 'Edit'}</Button>
      {/* Reset stays usable while collapsed. */}
      {actions}
    </div>;
  }
  return <div id={panelId} className="min-w-0">
    <PageFilterBar label={label} fields={fields} actions={<>
      {actions}
      <Button type="button" variant="ghost" size="toolbar" ref={registerToggle('expanded')} aria-expanded aria-controls={panelId}
        onClick={() => onToggle(false)}>
        <ChevronUp className="size-3.5" aria-hidden />{ko ? '접기' : 'Collapse'}
      </Button>
    </>} />
  </div>;
}

/**
 * Dev-only chrome (UI.md step 4): bottom-centre variant switcher (click or ←/→, not while typing) and a spacer
 * so the floating bar never covers the table's last row. Rendered at the end of the page content.
 */
export function FilterCollapsePrototypeChrome() {
  const { url, setPage } = usePlatform();
  const { lang } = useI18n();
  const ko = lang === 'ko';
  const variant = readVariant(url);
  const index = Math.max(0, VARIANTS.findIndex(candidate => candidate.key === variant));
  // Kernel builds the URL (no hand-built query string); replace keeps the history clean and skips the scroll jump.
  const step = (delta: number) => {
    const next = VARIANTS[(index + delta + VARIANTS.length) % VARIANTS.length];
    setPage({ variant: next.key }, { replace: true });
  };
  useEffect(() => {
    if (PROD) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
      event.preventDefault();
      step(event.key === 'ArrowLeft' ? -1 : 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  if (PROD) return null;
  const current = VARIANTS[index];
  return <>
    {/* Spacer: keeps the floating switcher from covering the table's last row. */}
    <div aria-hidden className="h-16" />
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border-strong bg-surface-card px-2 py-1.5 shadow-lg">
      <Button type="button" variant="ghost" size="icon-xs" aria-label={ko ? '이전 시안' : 'Previous variant'} onClick={() => step(-1)}>
        <ChevronLeft className="size-4" aria-hidden />
      </Button>
      <span className="whitespace-nowrap px-1 text-xs font-medium">{current.key} — {current.name[ko ? 'ko' : 'en']}</span>
      <Button type="button" variant="ghost" size="icon-xs" aria-label={ko ? '다음 시안' : 'Next variant'} onClick={() => step(1)}>
        <ChevronRight className="size-4" aria-hidden />
      </Button>
    </div>
  </>;
}
