// THROWAWAY #56: own-container priority overflow vs summary/disclosure.
import { createContext, useContext, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Capability, ContextKey } from '@ap/contracts';
import { useI18n } from '@ap/kernel';
import { Button, cn, Popover, PopoverContent, PopoverTrigger, type ProtoVariant } from '@ap/ui';
const EditingDone = createContext(() => {});
export const useContextEditingDone = () => useContext(EditingDone);
type Control = { key: ContextKey; cap: Capability; applied: boolean; node: ReactNode; compactNode?: ReactNode };
export function PrototypeContextBar({ variant, controls, summary, actions }: { variant: ProtoVariant; controls: Control[]; summary: string; actions: (narrow: boolean, done: () => void) => ReactNode }) {
  const { t, lang } = useI18n();
  const host = useRef<HTMLDivElement>(null);
  const items = useRef(new Map<ContextKey, HTMLDivElement>());
  const actionHost = useRef<HTMLDivElement>(null);
  const labelHost = useRef<HTMLSpanElement>(null);
  const overflowProbe = useRef<HTMLSpanElement>(null);
  const disclosure = useRef<HTMLButtonElement>(null);
  const [measurement, setMeasurement] = useState<{ width: number; widths: Map<ContextKey, number>; actions: number; label: number; overflow: number } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const panelId = useId();
  // Measure actual controls once before compression (no duplicate editors/queries),
  // then observe the bar itself as docked detail/sidebar resize its main column.
  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    const widths = new Map<ContextKey, number>();
    items.current.forEach((node, key) => widths.set(key, node.getBoundingClientRect().width));
    const actionWidth = actionHost.current?.getBoundingClientRect().width ?? 160;
    const labelWidth = labelHost.current?.getBoundingClientRect().width ?? 70;
    const overflowWidth = (overflowProbe.current?.getBoundingClientRect().width ?? 160) + 24;
    const measure = () => setMeasurement({ width: element.clientWidth - 24, widths, actions: actionWidth, label: labelWidth, overflow: overflowWidth });
    measure();
    const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const total = measurement ? [...measurement.widths.values()].reduce((sum, w) => sum + w, 0) + measurement.actions + measurement.label + (controls.length + 1) * 8 : 0;
  const narrow = !!measurement && measurement.width < total;
  const done = () => {
    if (variant !== 'C' || !expanded) return;
    setExpanded(false); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('[data-proto-context-disclosure]')?.focus());
  };
  const period = controls.find(c => c.key === 'time');
  const others = controls.filter(c => c.key !== 'time');
  let inlineCount = others.length;
  if (variant === 'B' && narrow && measurement) {
    // Fixed keep priority: room → condition → selection → carried lot/ppid/recipe/metric.
    // Overflow/action reservations are taken before adding the next indivisible control.
    const actionWidth = 64;
    const periodWidth = period ? Math.min(300, Math.max(120, measurement.width - measurement.overflow - actionWidth - 16)) : 0;
    let remaining = measurement.width - periodWidth - actionWidth - measurement.overflow - 24;
    inlineCount = 0;
    for (const control of others) {
      const size = (measurement.widths.get(control.key) ?? 352) + 8;
      if (size > remaining) break;
      remaining -= size; inlineCount++;
    }
  }
  const hidden = others.slice(inlineCount);
  const applied = hidden.filter(c => c.applied).length;
  const control = (c: Control, compact = false) => <div key={c.key} ref={node => { if (node) items.current.set(c.key, node); else items.current.delete(c.key); }} className={cn('min-w-0', c.key === 'time' && variant === 'B' && narrow ? 'flex-1' : 'shrink-0')}>{compact ? c.compactNode ?? c.node : c.node}</div>;
  const full = (wrap: boolean) => <div className={cn('flex items-center gap-2', wrap && 'flex-wrap')}>
    <span ref={labelHost} className="shrink-0 text-[11px] font-semibold text-text-secondary">{t('globalContext')}</span>
    {controls.map(c => control(c))}<div ref={actionHost} className="ml-auto shrink-0">{actions(false, done)}</div>
  </div>;
  const capLabel = (cap: Capability) => cap === 'apply' ? (lang === 'ko' ? '적용' : 'Apply') : cap === 'reference' ? t('referenceOnly') : t('notUsed');
  return <EditingDone.Provider value={done}><div ref={host} role="region" aria-label={t('globalContext')} className="relative min-w-0 border-b border-border-subtle bg-surface-canvas px-3" onKeyDownCapture={event => {
    if (event.key === 'Escape' && variant === 'C' && expanded) { event.preventDefault(); event.stopPropagation(); done(); }
  }}>
    <span ref={overflowProbe} aria-hidden className="pointer-events-none invisible absolute whitespace-nowrap text-xs">{lang === 'ko' ? '조건 8개 더 · 8개 적용 중' : '+8 keys · 8 active'}</span>
    <div className="flex h-[47px] min-w-0 items-center">
      {!measurement || !narrow ? <div className="w-full">{full(false)}</div> : variant === 'B' ? <div className="flex w-full min-w-0 items-center gap-2">
        {period && control(period, true)}{others.slice(0, inlineCount).map(c => control(c))}
        {hidden.length > 0 && <Popover open={overflowOpen} onOpenChange={setOverflowOpen}><PopoverTrigger asChild><Button type="button" size="sm" variant="secondary" className="h-8 shrink-0 whitespace-nowrap border-border-control text-xs" aria-label={lang === 'ko' ? `Context 조건 ${hidden.length}개 더 · ${applied}개 적용 중` : `${hidden.length} more Context keys · ${applied} active`}>
          {lang === 'ko' ? `조건 ${hidden.length}개 더 · ${applied}개 적용 중` : `+${hidden.length} keys · ${applied} active`}
        </Button></PopoverTrigger><PopoverContent align="end" className="w-[28rem] max-w-[calc(100vw-2rem)] border-border-control bg-surface-card p-3 text-text-secondary"><div className="grid gap-3">{hidden.map(c => <div key={c.key} className="min-w-0">{c.node}</div>)}</div></PopoverContent></Popover>}
        <div className="ml-auto shrink-0">{actions(true, done)}</div>
      </div> : <div className="flex w-full min-w-0 items-center gap-2">
        <span title={summary} className="min-w-0 flex-1 truncate text-xs text-text-secondary">{summary}</span>
        <span className="flex shrink-0 gap-1">{(['apply', 'reference', 'unsupported'] as const).map(cap => {
          const matching = controls.filter(c => c.cap === cap);
          return matching.length > 0 && <span key={cap} title={matching.map(c => c.key).join(', ')} className={cn('rounded-xs px-1 text-[10px] font-semibold', cap === 'unsupported' ? 'bg-accent-warn-soft text-text-warning-label' : 'bg-surface-sunken text-text-secondary')}>{capLabel(cap)} {matching.length}</span>;
        })}</span>
        <Button data-proto-context-disclosure ref={disclosure} type="button" size="sm" variant="secondary" className="h-8 shrink-0 border-border-control px-2 text-xs" aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpanded(value => !value)}>{lang === 'ko' ? 'Context 편집' : 'Edit Context'}</Button>
        <div className="shrink-0">{actions(true, done)}</div>
      </div>}
    </div>
    {variant === 'C' && narrow && <div id={panelId} hidden={!expanded} className="border-t border-border-subtle py-3">{expanded && full(true)}</div>}
  </div></EditingDone.Provider>;
}
