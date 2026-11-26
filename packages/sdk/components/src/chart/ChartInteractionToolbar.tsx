import { useContext, useRef, useState } from 'react';
import type { ReactNode, Ref } from 'react';
import { Download, MoreHorizontal, Table2 } from 'lucide-react';
import { useI18n, useMessages } from '@ap/kernel';
import { Button, cn, Popover, PopoverContent, PopoverTrigger } from '@ap/ui';
import { COMPONENTS_MESSAGES } from '../messages';
import { DockChartCloseMore, DockChartToolbarWidth, type DockChartLayoutActions } from '../dock/DockChartHead';
import { useElementSize } from '../state/useElementSize';
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
  exportDisabled?: boolean;
  exportTools?: ReactNode;
  secondary?: ReactNode;
  secondaryOpen?: boolean;
  onSecondaryOpenChange?: (open: boolean) => void;
  reserveCorner?: boolean;
  compact?: boolean;
  dockMaximize?: ReactNode;
  dockLayoutActions?: DockChartLayoutActions | undefined;
  dockToolsRevealed?: boolean;
  toolsReveal?: 'always' | 'hover';
};

export function ChartInteractionToolbar(p: Props) {
  const m = useMessages(COMPONENTS_MESSAGES);
  const handedOffFocus = useRef(false);
  const moreTrigger = useRef<HTMLButtonElement>(null);
  const docked = p.dockMaximize !== undefined;
  const exportMenu = p.exportCsv && <ChartExportMenu compact={p.compact} exportCsv={p.exportCsv} tools={p.exportTools} disabled={p.exportDisabled} />;
  return <header data-dock-chart-options={docked && p.start != null ? '' : undefined} data-tools-reveal={p.toolsReveal} className={cn(
    'flex shrink-0 items-center gap-1 break-keep',
    p.compact ? 'min-w-0 px-2 pt-1' : 'flex-wrap px-4 pt-3',
    docked && 'grid min-w-0 grid-cols-[minmax(min-content,1fr)] gap-3 py-0 ps-2 pe-1',
    docked && p.start != null && 'grid-cols-[minmax(0,max-content)_minmax(min-content,1fr)]',
    p.reserveCorner && 'pr-12',
    p.toolsReveal === 'hover' && !p.secondaryOpen && 'opacity-0 group-hover/chart:opacity-100 group-focus-within/chart:opacity-100',
  )}>
    {p.heading}
    {p.start != null && <div data-chart-toolbar-start data-reveal-x={docked ? '' : undefined} className={cn('flex items-center gap-1', p.compact ? 'min-w-0 flex-1' : 'flex-auto', docked && cn('overflow-x-auto [&>*]:shrink-0', CLIPPED_FOCUS))}>{p.start}</div>}
    <div role="toolbar" aria-label={m('chartActions')} data-reveal-x={p.compact && !docked ? '' : undefined} className={cn(
      'ml-auto flex min-w-0 items-center gap-1 whitespace-nowrap',
      p.compact && !docked && 'overflow-x-auto',
      !p.compact && 'flex-wrap justify-end',
      docked && 'ml-0 grid grid-cols-[minmax(0,1fr)_minmax(min-content,max-content)] px-1',
    )}>
      <div data-reveal-x={docked ? '' : undefined} data-dock-chart-tools={docked ? '' : undefined} data-revealed={docked && p.dockToolsRevealed ? '' : undefined} className={cn('flex items-center gap-1',
        p.compact && !docked && 'shrink-0', !p.compact && 'min-w-0 flex-wrap',
        docked && 'pointer-events-none min-w-0 overflow-x-auto p-1 opacity-0 focus-within:opacity-100 [&>*]:shrink-0')}>
        {p.zoom}{p.brush}{p.reset}{p.compare}{p.annotate}{docked && exportMenu}
      </div>
      {(p.table || p.exportCsv || p.secondary) && <div data-chart-toolbar-tail className={cn(!docked && 'ml-auto', 'flex shrink-0 items-center gap-1')}>
        {p.table && (docked
          ? <DockedChartTableToggle {...p.table} />
          : <ChartTableToggle {...p.table} compact={p.compact} />)}
        {!docked && exportMenu}
        {p.dockMaximize}
        {p.secondary && <Popover open={p.secondaryOpen} onOpenChange={open => {
          if (open) handedOffFocus.current = false;
          p.onSecondaryOpenChange?.(open);
        }}>
          <PopoverTrigger asChild><Button ref={moreTrigger} type="button" variant={chartToolVariant(!!p.compact)} size={p.compact ? 'icon-xs' : 'icon-sm'} data-dock-group-menu={p.dockLayoutActions ? '' : undefined} aria-label={m('chartMore')} title={m('chartMore')}><MoreHorizontal className="size-3.5" aria-hidden /></Button></PopoverTrigger>
          <PopoverContent align="end" aria-label={m('chartMore')} className="max-h-96 w-80 overflow-auto break-keep"
            onCloseAutoFocus={event => {
              if (handedOffFocus.current) event.preventDefault();
            }}>
            <div className="flex flex-col items-start gap-2">
              {p.secondary}
              {p.dockLayoutActions && <DockChartCloseMore.Provider value={() => {
                const focus = p.dockLayoutActions?.takeCloseFocus();
                handedOffFocus.current = !!focus;
                p.onSecondaryOpenChange?.(false);
                focus?.(moreTrigger.current);
              }}>{p.dockLayoutActions.content}</DockChartCloseMore.Provider>}
            </div>
          </PopoverContent>
        </Popover>}
      </div>}
    </div>
  </header>;
}

/** Buttons inside a clipping box draw focus inside themselves: the ring inset, and the forced-colors fallback outline (shadows are dropped there) pulled in. */
const CLIPPED_FOCUS = '[&_button:focus-visible]:ring-inset [&_button:focus-visible]:ring-offset-0 forced-colors:[&_button:focus-visible]:-outline-offset-2';

function DockedChartTableToggle(table: NonNullable<Props['table']>) {
  const stripWidth = useContext(DockChartToolbarWidth);
  const slot = useElementSize();
  const probe = useElementSize();
  const available = slot.width === null ? null : Math.min(slot.width, stripWidth ?? slot.width);
  const compact = available === null || probe.width === null || available < probe.width;
  // The inert text face supplies the preferred width even when the live button is compact.
  // The track's lower bound matches Button's icon-xs width, so the rest of the tail can stay fixed.
  return <div ref={slot.ref} data-dock-chart-table-slot className="relative grid grid-cols-[minmax(calc(var(--spacing)*7),max-content)] overflow-clip">
    <div aria-hidden inert className="invisible min-w-0 overflow-clip">
      <div ref={probe.ref} data-dock-chart-table-probe className="w-max">
        <ChartTableToggle shown={table.shown} toggle={table.toggle} disabled />
      </div>
    </div>
    <div className={cn('absolute inset-y-0 end-0 flex items-center', CLIPPED_FOCUS)}>
      <ChartTableToggle {...table} compact={compact} />
    </div>
  </div>;
}

/** `표로 보기`: the chart tool row's table toggle, shared by the Frame, category and canvas charts (#2792). */
export function ChartTableToggle({ shown, toggle, compact = false, disabled, buttonRef }: { shown: boolean; toggle: () => void; compact?: boolean; disabled?: boolean; buttonRef?: Ref<HTMLButtonElement> }) {
  const m = useMessages(COMPONENTS_MESSAGES);
  return <Button ref={buttonRef} type="button" variant={chartToolVariant(compact, shown)} size={compact ? 'icon-xs' : 'toolbar'} aria-label={m('chartShowAsTable')} title={m('chartShowAsTable')} aria-pressed={shown} disabled={disabled} onClick={toggle}>
    <Table2 className="size-3.5" aria-hidden />{!compact && <span className="t-chart-tool">{m('chartShowAsTable')}</span>}
  </Button>;
}

/** `내보내기`: a menu with `내보내기 CSV` first and the chart's image actions (`tools`) after it (#2792). Mount it only when export is allowed. */
export function ChartExportMenu({ exportCsv, tools, compact = false, disabled }: { exportCsv: () => void; tools?: ReactNode; compact?: boolean; disabled?: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  if (disabled && open) setOpen(false);
  return <Popover open={open && !disabled} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button type="button" variant={chartToolVariant(compact)} size={compact ? 'icon-xs' : 'toolbar'} aria-label={t('export')} title={t('export')} disabled={disabled}><Download className="size-3.5" aria-hidden />{!compact && <span className="t-chart-tool">{t('export')}</span>}</Button></PopoverTrigger>
    <PopoverContent align="end" aria-label={t('export')} className="w-auto break-keep"><div className="flex flex-wrap gap-1">
      <Button type="button" variant="ghost" size="toolbar" onClick={() => { exportCsv(); setOpen(false); }}><span className="t-chart-tool">{t('export')} CSV</span></Button>
      {tools}
    </div></PopoverContent>
  </Popover>;
}

type GestureOptions = {
  point: boolean;
  additive?: boolean;
  drill: boolean;
  range?: boolean;
  brushing?: boolean;
};

export function useChartGestureHint({ point, additive = true, drill, range = false, brushing = false }: GestureOptions) {
  const m = useMessages(COMPONENTS_MESSAGES);
  const gestures: string[] = [];
  if (point && !brushing) gestures.push(m('chartHintSelect'));
  if (point && additive && !brushing) gestures.push(m('chartHintAdd'));
  if (drill && !brushing) gestures.push(m('chartHintDrill'));
  if (range) gestures.push(m(brushing ? 'chartBrushHint' : 'chartHintEnableDrag'));
  return gestures.join(' · ');
}

export function ChartGestureHint(options: GestureOptions) {
  const hint = useChartGestureHint(options);
  return !!hint && <p className="shrink-0 px-2 py-0.5 text-xs text-text-secondary break-keep">{hint}</p>;
}
