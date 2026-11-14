import { useId } from 'react';
import { usePlatform } from '@ap/kernel';
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ap/ui';
import type { ItemRow } from '../endpoints';
import { COMPARISON_DAYS, comparisonFor, safeComparisonHref } from '../effect-comparison';
import { useCopy } from '../copy';
import { originPeriod } from '../model';
import { Field, Section } from './parts';
export function useEffectComparison(item: ItemRow, days: number) {
  const { resolveLink, registry } = usePlatform();
  return comparisonFor(item.actionDate, item.restricted ? null : item.origin, days, (id, options) => {
    const menu = registry.menuById(id);
    if (!menu.features.compare || menu.context.time !== 'apply') throw new Error('Unsupported comparison destination');
    return resolveLink(id, options);
  });
}
export function EffectCheck({ item, days, onDaysChange, comparison, selected, onSelect }: {
  item: ItemRow; days: number; onDaysChange: (days: number) => void;
  comparison: ReturnType<typeof comparisonFor>; selected: boolean; onSelect: () => void;
}) {
  const c = useCopy(), uid = useId(), { registry, canOpen, location } = usePlatform();
  const stored = item.effectCompareLink;
  const storedRoute = stored && safeComparisonHref(stored) ? registry.matchRoute(stored.split('?')[0]!) : null;
  const storedAllowed = storedRoute && canOpen(storedRoute.menu.id);
  const reason = comparison.reason === 'noDate' ? c.comparisonNoDate : comparison.reason === 'noOrigin' ? c.comparisonNoOrigin : c.comparisonUnavailable;
  return <Section title={c.effect}>
    {(item.restricted || item.effectCompareRestricted) && <p className="text-sm text-text-secondary">{item.restricted ? c.restrictedDetail : c.restrictedComparison}</p>}
    {item.effectResult && <dl className="space-y-2 text-sm"><dt className="text-text-secondary">{c.recordedResult}</dt><dd className="font-semibold">{c.effects[item.effectResult]}</dd>{item.effectNote && <><dt className="text-text-secondary">{c.note}</dt><dd className="whitespace-pre-wrap break-words">{item.effectNote}</dd></>}{stored && <dd>{storedAllowed ? <Button asChild variant="link" size="sm" padding="compact" wrapText><a href={location.href(stored)} target="_blank" rel="noopener noreferrer">{c.comparisonSaved}</a></Button> : <p className="text-text-secondary">{c.comparisonUnavailable}</p>}</dd>}</dl>}
    {!item.restricted && item.status !== 'verified' && <div className="space-y-3 text-sm">
      {comparison.periods ? <><Field id={`${uid}-length`} label={c.comparisonLength}><Select value={String(days)} onValueChange={v => onDaysChange(Number(v))}><SelectTrigger id={`${uid}-length`}><SelectValue /></SelectTrigger><SelectContent>{COMPARISON_DAYS.map(n => <SelectItem key={n} value={String(n)}>{n}{n === 1 ? c.day : c.days}</SelectItem>)}</SelectContent></Select></Field><dl className="space-y-2"><dt className="text-text-secondary">{c.before}</dt><dd className="break-words">{originPeriod(comparison.periods.before, c.lang)}</dd><dt className="text-text-secondary">{c.after}</dt><dd className="break-words">{comparison.periods.after ? originPeriod(comparison.periods.after, c.lang) : c.unset}</dd></dl></> : null}
      {comparison.href ? <><p className="text-text-secondary">{c.comparisonHint}</p><div className="flex flex-wrap items-center gap-3"><Button asChild variant="link" size="sm" padding="compact" wrapText><a href={location.href(comparison.href)} target="_blank" rel="noopener noreferrer" onClick={onSelect}>{c.comparisonOpen}</a></Button><Button type="button" variant="secondary" size="sm" aria-pressed={selected} onClick={onSelect}>{c.comparisonUse}</Button></div><p role="status" className="min-h-5 text-text-secondary">{selected ? c.comparisonSelected : null}</p></> : <p className="text-text-secondary">{reason}</p>}
    </div>}
  </Section>;
}
