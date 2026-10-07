import { createContext, useContext, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction, type ReactNode } from 'react';
import type { ContextKey } from '@ap/contracts';
import { useI18n } from '@ap/kernel';
import { Button, Popover, PopoverContent, PopoverTrigger } from '@ap/ui';

/** Measuring copies are inert and must never make adapter requests. */
export const MeasuringContext = createContext(false);
type Drafts = Record<string, unknown>;
const EditorState = createContext<{ key: ContextKey; drafts: Drafts; update: Dispatch<SetStateAction<Drafts>>; recovering: { current: boolean } } | null>(null);

/** Draft/open state belongs above both render locations; measuring copies keep isolated local state. */
export function useContextEditorState<T>(field: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const context = useContext(EditorState);
  const measuring = useContext(MeasuringContext);
  const [local, setLocal] = useState(initial);
  if (!context || measuring) return [local, setLocal];
  const id = `${context.key}:${field}`;
  const value = Object.hasOwn(context.drafts, id) ? context.drafts[id] as T : local;
  return [value, next => context.update(previous => {
    const before = Object.hasOwn(previous, id) ? previous[id] as T : local;
    const after = typeof next === 'function' ? (next as (value: T) => T)(before) : next;
    // A fresh editing session starts from committed values, as before.
    const retained = field === 'open' && after === false
      ? Object.fromEntries(Object.entries(previous).filter(([name]) => !name.startsWith(`${context.key}:`))) : previous;
    return { ...retained, [id]: after };
  })];
}

/** Radix must not dismiss an active editor during our connected-focus recovery. */
export function useContextEditorFocusRecovery() {
  const context = useContext(EditorState);
  return (event: { preventDefault: () => void }) => { if (context?.recovering.current) event.preventDefault(); };
}

type Control = { key: ContextKey; applied: boolean; node: ReactNode; compactNode?: ReactNode };
type Measurements = { width: number; controls: number[]; period: number; actions: number; icons: number; label: number; overflow: number[] };

export function ContextBarLayout({ controls, revision, actions }: {
  controls: Control[]; revision: string; actions: (compact: boolean) => ReactNode;
}) {
  const { t, lang } = useI18n();
  const host = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLDivElement>(null);
  const [drafts, setDrafts] = useState<Drafts>({});
  const [overflowOpen, setOverflowOpen] = useState(false);
  const recoveringFocus = useRef(false);
  const focusedKey = useRef<ContextKey | null>(null);
  const placements = useRef(new Map<ContextKey, string>());
  const overflowTrigger = useRef<HTMLButtonElement>(null);
  const [measurement, setMeasurement] = useState<Measurements | null>(null);
  const period = controls.find(c => c.key === 'time');
  const others = controls.filter(c => c.key !== 'time');
  const overflowLabel = (count: number, applied: number) => (lang === 'ko' ? `조건 ${count}개 더` : `${count} more`)
    + (applied ? (lang === 'ko' ? ` · ${applied}개 적용 중` : ` · ${applied} applied`) : '');

  useLayoutEffect(() => {
    const element = host.current;
    const layer = probe.current;
    if (!element || !layer) return;
    const size = (name: string) => layer.querySelector<HTMLElement>(`[data-measure="${name}"]`)?.getBoundingClientRect().width ?? 0;
    let disposed = false;
    const measure = () => {
      if (disposed) return;
      // Both boxes may change independently (docked slot, font swap, late glyph subsets).
      const intrinsic = {
        controls: Array.from(layer.querySelectorAll<HTMLElement>('[data-measure-key]'), node => node.getBoundingClientRect().width),
        period: size('period'), actions: size('actions'), icons: size('icons'), label: size('label'),
        overflow: Array.from(layer.querySelectorAll<HTMLElement>('[data-measure-overflow]'), node => node.getBoundingClientRect().width),
      };
      const style = getComputedStyle(element);
      const width = element.getBoundingClientRect().width
        - ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth'].reduce((sum, property) => sum + (parseFloat(style[property as keyof CSSStyleDeclaration] as string) || 0), 0);
      const next = { width, ...intrinsic };
      setMeasurement(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(element);
    observer?.observe(layer);
    if (!observer) window.addEventListener('resize', measure);
    const fonts = document.fonts;
    void fonts?.ready?.then(measure);
    fonts?.addEventListener('loadingdone', measure);
    return () => {
      disposed = true;
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      fonts?.removeEventListener('loadingdone', measure);
    };
  }, [revision]);

  const gap = 8;
  const fullWidth = measurement ? measurement.controls.reduce((sum, width) => sum + width, 0)
    + measurement.actions + measurement.label + gap * (controls.length + 1) : Infinity;
  const labelVisible = !!measurement && fullWidth <= measurement.width;
  const compact = !measurement || fullWidth - measurement.label - gap > measurement.width;
  let inlineCount = others.length;
  if (compact && measurement) {
    // Hide the label first, then presets, then trailing keys; reserve the actual overflow label.
    const widths = measurement.controls.slice(period ? 1 : 0);
    for (; inlineCount >= 0; inlineCount--) {
      const hiddenCount = others.length - inlineCount;
      const used = widths.slice(0, inlineCount).reduce((sum, width) => sum + width, 0)
        + (period ? measurement.period : 0) + measurement.icons
        + (hiddenCount ? measurement.overflow[hiddenCount - 1] : 0)
        + gap * (inlineCount + (period ? 1 : 0) + (hiddenCount ? 1 : 0));
      if (used <= measurement.width || inlineCount === 0) break;
    }
  } else if (!measurement) inlineCount = 0;
  const hidden = others.slice(inlineCount);
  const label = overflowLabel(hidden.length, hidden.filter(c => c.applied).length);
  const focusBar = () => {
    const element = host.current;
    recoveringFocus.current = true;
    try { (element?.querySelector<HTMLButtonElement>('[data-context-key] button') ?? overflowTrigger.current ?? element)?.focus(); }
    finally { recoveringFocus.current = false; }
  };
  const placement = controls.map(control => `${control.key}:${hidden.some(c => c.key === control.key) ? 'overflow' : 'inline'}`).join(',');
  useLayoutEffect(() => {
    const next = new Map<ContextKey, string>(controls.map(control => [control.key, hidden.some(c => c.key === control.key) ? 'overflow' : 'inline']));
    const active = Object.entries(drafts).filter(([field, value]) => field.endsWith(':open') && value === true).map(([field]) => field.split(':')[0] as ContextKey);
    const moved = [focusedKey.current, ...active].some(key => key && placements.current.has(key) && placements.current.get(key) !== next.get(key));
    placements.current = next;
    if (!hidden.length) setOverflowOpen(false);
    // Run after Radix's mount/close autofocus; disconnected triggers cannot return focus themselves.
    let cancelled = false;
    if (moved) queueMicrotask(() => { if (!cancelled) focusBar(); });
    return () => { cancelled = true; };
  }, [placement]);
  const activeHidden = hidden.some(control => drafts[`${control.key}:open`] === true);
  const item = (control: Control, compactPeriod = false) => <EditorState.Provider key={control.key} value={{ key: control.key, drafts, update: setDrafts, recovering: recoveringFocus }}>
    <div data-context-key={control.key} onFocusCapture={() => { focusedKey.current = control.key; }} className={compactPeriod ? 'min-w-0 flex-1' : 'shrink-0'}>
      {compactPeriod ? control.compactNode ?? control.node : control.node}
    </div>
  </EditorState.Provider>;
  return <div ref={host} tabIndex={-1} role="region" aria-label={t('globalContext')} className="relative h-12 min-w-0 border-b border-border-subtle bg-surface-canvas/95 px-3 backdrop-blur">
    <div inert aria-hidden className="pointer-events-none invisible absolute inset-0 overflow-hidden">
    <div ref={probe} data-context-measuring className="flex w-max items-center gap-2 whitespace-nowrap">
      <MeasuringContext.Provider value>
        <span data-measure="label" className="text-tiny font-semibold uppercase tracking-wide text-text-muted">{t('globalContext')}</span>
        {controls.map(control => <div key={control.key} data-measure-key={control.key}>{control.node}</div>)}
        {period && <div data-measure="period">{period.compactNode ?? period.node}</div>}
        <div data-measure="actions">{actions(false)}</div><div data-measure="icons">{actions(true)}</div>
        {others.map((_, index) => {
          const trailing = others.slice(others.length - index - 1);
          return <Button key={index} data-measure-overflow size="sm" variant="secondary" className="h-8 whitespace-nowrap border-border-control text-xs">{overflowLabel(trailing.length, trailing.filter(c => c.applied).length)}</Button>;
        })}
      </MeasuringContext.Provider>
    </div></div>
    <div className="flex h-full min-w-0 items-center gap-2 whitespace-nowrap">
      {labelVisible && <span className="shrink-0 text-tiny font-semibold uppercase tracking-wide text-text-muted">{t('globalContext')}</span>}
      {period && item(period, compact)}
      {others.slice(0, inlineCount).map(control => item(control))}
      {hidden.length > 0 && <Popover open={overflowOpen || activeHidden} onOpenChange={setOverflowOpen}><PopoverTrigger asChild>
        <Button ref={overflowTrigger} data-context-overflow type="button" size="sm" variant="secondary" className="h-8 shrink-0 whitespace-nowrap border-border-control text-xs" aria-label={label} title={label}>{label}</Button>
      </PopoverTrigger><PopoverContent onFocusOutside={event => { if (recoveringFocus.current) event.preventDefault(); }} onCloseAutoFocus={event => { if (!overflowTrigger.current?.isConnected) { event.preventDefault(); focusBar(); } }} aria-label={lang === 'ko' ? '추가 Context 조건' : 'More Context conditions'} align="end" className="w-[28rem] max-w-[calc(100vw-2rem)] border-border-control bg-surface-card p-3">
        <div className="grid gap-3">{hidden.map(control => item(control))}</div>
      </PopoverContent></Popover>}
      <div className="ml-auto shrink-0">{actions(compact)}</div>
    </div>
  </div>;
}
