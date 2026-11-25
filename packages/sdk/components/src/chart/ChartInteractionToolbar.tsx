import { useState } from 'react';
import type { ReactNode, Ref } from 'react';
import { Download, MoreHorizontal, Table2 } from 'lucide-react';
import { useI18n, useMessages } from '@ap/kernel';
import { Button, cn, Popover, PopoverContent, PopoverTrigger } from '@ap/ui';
import { COMPONENTS_MESSAGES } from '../messages';
import { chartToolVariant } from './chartChrome';

type Props = {
  heading: ReactNode;
  start?: ReactNode;
  zoom?: ReactNode;
  brush?: ReactNode;
  reset?: ReactNode;
  compare?: ReactNode;
  annotate?: ReactNode;
  table?: { shown: boolean; toggle: () => void; buttonRef?: Ref<HTMLButtonElement> };
  exportCsv?: () => void;
  exportTools?: ReactNode;
  secondary?: ReactNode;
  secondaryOpen?: boolean;
  onSecondaryOpenChange?: (open: boolean) => void;
  reserveCorner?: boolean;
  compact?: boolean;
  toolsReveal?: 'always' | 'hover';
};

export function ChartInteractionToolbar(p: Props) {
  const m = useMessages(COMPONENTS_MESSAGES);
  return <header data-tools-reveal={p.toolsReveal} className={cn(
    'flex shrink-0 items-center gap-1 break-keep',
    p.compact ? 'min-w-0 px-2 pt-1' : 'flex-wrap px-4 pt-3',
    p.reserveCorner && 'pr-12',
    p.toolsReveal === 'hover' && !p.secondaryOpen && 'opacity-0 group-hover/chart:opacity-100 group-focus-within/chart:opacity-100',
  )}>
    {p.heading}
    {p.start != null && <div data-chart-toolbar-start className={cn('flex items-center gap-1', p.compact ? 'min-w-0 flex-1' : 'flex-auto')}>{p.start}</div>}
    <div role="toolbar" aria-label={m('chartActions')} data-reveal-x={p.compact ? '' : undefined} className={cn(
      'ml-auto flex min-w-0 items-center gap-1 whitespace-nowrap',
      p.compact ? 'overflow-x-auto' : 'flex-wrap justify-end',
    )}>
      <div className={cn('flex items-center gap-1', p.compact ? 'shrink-0' : 'min-w-0 flex-wrap')}>
        {p.zoom}{p.brush}{p.reset}{p.compare}{p.annotate}
      </div>
      {(p.table || p.exportCsv || p.secondary) && <div data-chart-toolbar-tail className="ml-auto flex shrink-0 items-center gap-1">
        {p.table && <ChartTableToggle compact={p.compact} shown={p.table.shown} toggle={p.table.toggle} buttonRef={p.table.buttonRef} />}
        {p.exportCsv && <ChartExportMenu compact={p.compact} exportCsv={p.exportCsv} tools={p.exportTools} />}
        {p.secondary && <Popover open={p.secondaryOpen} onOpenChange={p.onSecondaryOpenChange}>
          <PopoverTrigger asChild><Button type="button" variant={chartToolVariant(!!p.compact)} size={p.compact ? 'icon-xs' : 'icon-sm'} aria-label={m('chartMore')} title={m('chartMore')}><MoreHorizontal className="size-3.5" aria-hidden /></Button></PopoverTrigger>
          <PopoverContent align="end" aria-label={m('chartMore')} className="max-h-96 w-80 overflow-auto break-keep"><div className="flex flex-col items-start gap-2">{p.secondary}</div></PopoverContent>
        </Popover>}
      </div>}
    </div>
  </header>;
}

/** `표로 보기`: the chart tool row's table toggle, shared by the Frame, category and canvas charts (#2792). */
export function ChartTableToggle({ shown, toggle, compact = false, disabled, buttonRef }: { shown: boolean; toggle: () => void; compact?: boolean; disabled?: boolean; buttonRef?: Ref<HTMLButtonElement> }) {
  const m = useMessages(COMPONENTS_MESSAGES);
  return <Button ref={buttonRef} type="button" variant={chartToolVariant(compact, shown)} size={compact ? 'icon-xs' : 'toolbar'} aria-label={m('chartShowAsTable')} title={m('chartShowAsTable')} aria-pressed={shown} disabled={disabled} onClick={toggle}>
    <Table2 className="size-3.5" aria-hidden />{!compact && m('chartShowAsTable')}
  </Button>;
}

/** `내보내기`: a menu with `내보내기 CSV` first and the chart's image actions (`tools`) after it (#2792). Mount it only when export is allowed. */
export function ChartExportMenu({ exportCsv, tools, compact = false }: { exportCsv: () => void; tools?: ReactNode; compact?: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button type="button" variant={chartToolVariant(compact)} size={compact ? 'icon-xs' : 'toolbar'} aria-label={t('export')} title={t('export')}><Download className="size-3.5" aria-hidden />{!compact && t('export')}</Button></PopoverTrigger>
    <PopoverContent align="end" aria-label={t('export')} className="w-auto break-keep"><div className="flex flex-wrap gap-1">
      <Button type="button" variant="ghost" size="toolbar" onClick={() => { exportCsv(); setOpen(false); }}>{t('export')} CSV</Button>
      {tools}
    </div></PopoverContent>
  </Popover>;
}

export function ChartGestureHint({ point, additive = true, drill, range = false, brushing = false }: {
  point: boolean;
  additive?: boolean;
  drill: boolean;
  range?: boolean;
  brushing?: boolean;
}) {
  const m = useMessages(COMPONENTS_MESSAGES);
  const gestures: string[] = [];
  if (point && !brushing) gestures.push(m('chartHintSelect'));
  if (point && additive && !brushing) gestures.push(m('chartHintAdd'));
  if (drill && !brushing) gestures.push(m('chartHintDrill'));
  if (range) gestures.push(m(brushing ? 'chartBrushHint' : 'chartHintEnableDrag'));
  return gestures.length > 0 && <p className="shrink-0 px-2 py-0.5 text-xs text-text-secondary break-keep">{gestures.join(' · ')}</p>;
}
