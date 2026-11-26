import { createContext, useContext, useMemo, useRef, type CSSProperties } from 'react';
import type { ECharts } from 'echarts/core';
import { drillEntryPage, useMessages, type DrillTrailStep, type MenuPlatform } from '@ap/kernel';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@ap/ui';
import { COMPONENTS_MESSAGES } from '../messages';
import { revealFocused, scrollContainerOf } from '../visibleArea';

const createBasisMemory = () => new Map<string, string>();
export const DrillBasisMemory = createContext<ReturnType<typeof createBasisMemory> | null>(null);

export function useDrillBasisMemory({ adapter, can, global, pathname, revision }: MenuPlatform) {
  const context = JSON.stringify(global);
  return useMemo(createBasisMemory, [adapter, can, context, pathname, revision]);
}

export function useDrillBasisChoice(platform: MenuPlatform, trail: readonly DrillTrailStep[]) {
  const shared = useContext(DrillBasisMemory);
  const local = useDrillBasisMemory(platform);
  const memory = shared ?? local;
  const keyFor = (key: string, value: string) => JSON.stringify([...trail.map(step => [step.key, step.value, step.basis]), key, value]);
  return {
    current: (key: string, value: string) => memory.get(keyFor(key, value)),
    remember: (key: string, value: string, basis: string | undefined) => {
      if (basis === undefined) memory.delete(keyFor(key, value));
      else memory.set(keyFor(key, value), basis);
    },
  };
}

export function drillBasisChoices(platform: MenuPlatform, key: string, value: string, defaultLabel: string, lang: 'ko' | 'en') {
  const drill = platform.route?.menu.drill;
  const bases = drill?.levels.find(level => level.key === key)?.bases;
  if (!bases?.length) return undefined;
  return [
    { id: '', label: defaultLabel },
    ...bases.filter(({ id }) => drill?.isBasisAvailable?.(key, id, platform.global, platform.can, drillEntryPage(platform, key, value, { basis: id })) !== false)
      .map(({ id, label }) => ({ id, label: typeof label === 'function' ? label(lang) : label })),
  ];
}

type BarLayout = { x: number; y: number; width: number; height: number };
type SeriesData = {
  indexOfRawIndex: (index: number) => number;
  getItemLayout: (index: number) => BarLayout | undefined;
};
type Anchor = { left: number; top: number; width: number; height: number };

export function chartBasisAnchor(chart: ECharts | null, plot: HTMLElement | null, seriesId: string, index: number, options?: { reveal: boolean; revealRow: boolean }): Anchor | undefined {
  if (!chart || chart.isDisposed?.() || !plot || index < 0) return undefined;
  // Native series layout follows the rendered stack/axis and preserves the raw index across data zoom.
  const model = (chart as unknown as { getModel: () => { getSeries: () => { id: string; getData: () => SeriesData }[] } }).getModel();
  const data = model.getSeries().find(series => series.id === seriesId)?.getData();
  const visibleIndex = data?.indexOfRawIndex(index) ?? -1;
  const rect = visibleIndex < 0 ? undefined : data?.getItemLayout(visibleIndex);
  if (!rect || ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) return undefined;
  const chartBox = chart.getDom().getBoundingClientRect();
  const plotBox = plot.getBoundingClientRect();
  const left = chartBox.left - plotBox.left + plot.scrollLeft + Math.min(rect.x, rect.x + rect.width);
  const top = chartBox.top - plotBox.top + plot.scrollTop + Math.min(rect.y, rect.y + rect.height);
  const width = Math.abs(rect.width), height = Math.abs(rect.height);
  if (options?.revealRow && plot.clientHeight > 0) {
    if (top < plot.scrollTop) plot.scrollTop = top;
    else if (top + height > plot.scrollTop + plot.clientHeight) plot.scrollTop = top + height - plot.clientHeight;
  }
  const markRect = () => {
    const box = plot.getBoundingClientRect();
    return new DOMRect(box.left + left - plot.scrollLeft, box.top + top - plot.scrollTop, width, height);
  };
  if (options?.reveal) revealFocused(plot, { getRect: markRect });
  const { top: y, left: x } = markRect();
  if (y + height < 0 || y >= window.innerHeight || x + width < 0 || x >= window.innerWidth ||
    (plot.clientHeight > 0 && (top + height < plot.scrollTop || top >= plot.scrollTop + plot.clientHeight))) return undefined;
  for (let container = scrollContainerOf(plot); container; container = scrollContainerOf(container)) {
    const { top: containerTop } = container.getBoundingClientRect();
    if (container.clientHeight > 0 && (y + height < containerTop || y >= containerTop + container.clientHeight)) return undefined;
  }
  return { left, top, width, height };
}

export function ChartDrillBasisMenu({ anchor, choices, current, onPick, onClose, onCancel }: {
  anchor: Anchor | undefined;
  choices: NonNullable<ReturnType<typeof drillBasisChoices>>;
  current: string | undefined;
  onPick: (basis: string | undefined) => void;
  onClose: () => void;
  onCancel: () => void;
}) {
  const m = useMessages(COMPONENTS_MESSAGES);
  const escaped = useRef(false);
  return <DropdownMenu open={anchor !== undefined} onOpenChange={open => { if (!open) onClose(); }} modal={false}>
    <DropdownMenuTrigger asChild>
      <span aria-hidden className="pointer-events-none absolute top-(--basis-top) left-(--basis-left) h-(--basis-height) w-(--basis-width)"
        style={anchor && {
          '--basis-left': `${anchor.left}px`, '--basis-top': `${anchor.top}px`,
          '--basis-width': `${anchor.width}px`, '--basis-height': `${anchor.height}px`,
        } as CSSProperties} />
    </DropdownMenuTrigger>
    <DropdownMenuContent side="bottom" align="start" aria-labelledby={undefined} aria-label={m('drillBasis')}
      onKeyDown={event => event.stopPropagation()}
      onEscapeKeyDown={() => { escaped.current = true; }}
      onCloseAutoFocus={event => {
        event.preventDefault();
        if (escaped.current) onCancel();
        escaped.current = false;
      }}>
      <DropdownMenuRadioGroup value={current ?? ''}>
        {choices.map(({ id, label }) => <DropdownMenuRadioItem key={id} value={id}
          className="break-keep focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring"
          onSelect={() => onPick(id || undefined)}>{label}</DropdownMenuRadioItem>)}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>;
}
