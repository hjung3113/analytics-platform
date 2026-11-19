import { useState } from 'react';
import type { ReactNode } from 'react';
import { Download, MoreHorizontal, Table2 } from 'lucide-react';
import { useI18n, useMessages } from '@ap/kernel';
import { Button, cn, Popover, PopoverContent, PopoverTrigger } from '@ap/ui';
import { COMPONENTS_MESSAGES } from '../messages';

type Props = {
  heading: ReactNode;
  start?: ReactNode;
  zoom?: ReactNode;
  brush?: ReactNode;
  reset?: ReactNode;
  compare?: ReactNode;
  annotate?: ReactNode;
  table?: { shown: boolean; toggle: () => void };
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
  const { t } = useI18n();
  const m = useMessages(COMPONENTS_MESSAGES);
  const size = p.compact ? 'icon-xs' : 'toolbar';
  const [exportOpen, setExportOpen] = useState(false);
  return <header data-tools-reveal={p.toolsReveal} className={cn(
    'flex shrink-0 items-center gap-1 break-keep',
    p.compact ? 'min-w-0 px-2 pt-1' : 'flex-wrap px-4 pt-3',
    p.reserveCorner && 'pr-12',
    p.toolsReveal === 'hover' && !p.secondaryOpen && 'opacity-0 group-hover/chart:opacity-100 group-focus-within/chart:opacity-100',
  )}>
    {p.heading}
    {p.start != null && <div data-chart-toolbar-start className="flex min-w-0 flex-1 items-center gap-1">{p.start}</div>}
    <div role="toolbar" aria-label={m('chartActions')} className={cn(
      'ml-auto flex min-w-0 items-center gap-1 whitespace-nowrap',
      p.compact ? 'overflow-x-auto' : 'flex-wrap justify-end',
    )}>
      <div className={cn('flex items-center gap-1', p.compact ? 'shrink-0' : 'min-w-0 flex-wrap')}>
        {p.zoom}{p.brush}{p.reset}{p.compare}{p.annotate}
      </div>
      {(p.table || p.exportCsv || p.secondary) && <div data-chart-toolbar-tail className="ml-auto flex shrink-0 items-center gap-1">
        {p.table && <Button type="button" variant="ghost" size={size} aria-label={m('chartShowAsTable')} title={m('chartShowAsTable')} aria-pressed={p.table.shown} onClick={p.table.toggle}>
          <Table2 className="size-3.5" aria-hidden />{!p.compact && m('chartShowAsTable')}
        </Button>}
        {p.exportCsv && <Popover open={exportOpen} onOpenChange={setExportOpen}>
          <PopoverTrigger asChild><Button type="button" variant="ghost" size={size} aria-label={t('export')} title={t('export')}><Download className="size-3.5" aria-hidden />{!p.compact && t('export')}</Button></PopoverTrigger>
          <PopoverContent align="end" aria-label={t('export')} className="w-auto break-keep"><div className="flex flex-wrap gap-1">
            <Button type="button" variant="ghost" size="toolbar" onClick={() => { p.exportCsv?.(); setExportOpen(false); }}>{t('export')} CSV</Button>
            {p.exportTools}
          </div></PopoverContent>
        </Popover>}
        {p.secondary && <Popover open={p.secondaryOpen} onOpenChange={p.onSecondaryOpenChange}>
          <PopoverTrigger asChild><Button type="button" variant="ghost" size="icon-xs" aria-label={m('chartMore')} title={m('chartMore')}><MoreHorizontal className="size-3.5" aria-hidden /></Button></PopoverTrigger>
          <PopoverContent align="end" aria-label={m('chartMore')} className="max-h-96 w-80 overflow-auto break-keep"><div className="flex flex-col items-start gap-2">{p.secondary}</div></PopoverContent>
        </Popover>}
      </div>}
    </div>
  </header>;
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
