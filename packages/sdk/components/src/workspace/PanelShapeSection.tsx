import { useId } from 'react';
import {
  CHART_CONFIG_COLORS, CHART_PANEL_DECIMALS, chartPanelProblem,
  type ChartConfigColor, type ChartPanelDraft, type ChartPermissionCheck, type MenuChartFields, type Text,
} from '@ap/contracts';
import { useI18n, useMessages } from '@ap/kernel';
import { FieldLabel, ToggleGroup, ToggleGroupItem, cn } from '@ap/ui';
import { COMPONENTS_MESSAGES } from '../messages';
import type { PanelSettingsMapping } from './PanelSettingsDrawer';

/** «자동» stays while the owner chooses three options or two (#2762). Dropping a row here is the whole change. */
const AREA_FILL_OPTIONS = [
  { id: 'auto', value: undefined, label: 'panelShapeAuto' },
  { id: 'off', value: false, label: 'panelShapeOff' },
  { id: 'on', value: true, label: 'panelShapeOn' },
] as const;
/** Digits the shape row offers, taken from the front of `CHART_PANEL_DECIMALS`. */
const SHAPE_DECIMAL_PLACES = CHART_PANEL_DECIMALS.slice(0, 3);
const STACK_OPTIONS = [
  { id: 'none', value: 'none', label: 'panelShapeStackNone' },
  { id: 'stack', value: 'stack', label: 'panelShapeStackOn' },
] as const;
const ORIENTATION_OPTIONS = [
  { id: 'vertical', value: 'vertical', label: 'panelShapeVertical' },
  { id: 'horizontal', value: 'horizontal', label: 'panelShapeHorizontal' },
] as const;
/** `createChartPanel` omits this token, so the row treats it as the unwritten default. */
const DEFAULT_SERIES: ChartConfigColor = 'chart-series-1';
const SWATCH_CLASS: Record<ChartConfigColor, string> = {
  'chart-series-1': 'bg-chart-series-1',
  'chart-series-2': 'bg-chart-series-2',
  'chart-series-3': 'bg-chart-series-3',
  'chart-series-4': 'bg-chart-series-4',
};

type ShapeKey = 'stack' | 'areaFill' | 'orientation' | 'color' | 'decimals';
type ShapeOption<K extends ShapeKey> = { id: string; value: ChartPanelDraft[K]; label: string; swatch?: ChartConfigColor };
type RowOption = { id: string; label: string; swatch?: ChartConfigColor; reason?: string; pick: () => void };

/** Writes one shape key, or drops it when `value` is a default `createChartPanel` leaves unwritten. */
function withShapeKey<K extends ShapeKey>(draft: ChartPanelDraft, key: K, value: ChartPanelDraft[K]): ChartPanelDraft {
  const next = { ...draft };
  delete next[key];
  if (value !== undefined && value !== 'none' && value !== 'vertical' && value !== DEFAULT_SERIES) next[key] = value;
  return next;
}

/** A choice is blocked only when it adds a problem the key's default does not already have. `incomplete` is not this row's reason. */
function choiceReason<K extends ShapeKey>(fields: MenuChartFields, draft: ChartPanelDraft, granted: ChartPermissionCheck, key: K, value: ChartPanelDraft[K], tx: (text: Text) => string): string | undefined {
  const problem = chartPanelProblem(fields, withShapeKey(draft, key, value), granted);
  if (!problem || problem.code === 'incomplete') return undefined;
  const cleared = chartPanelProblem(fields, withShapeKey(draft, key, undefined), granted);
  if (cleared?.code === problem.code) return undefined;
  return tx(problem.reason);
}

/** One single-choice row: text segments, or color circles when the options carry a swatch. Blocked options stay focusable and name their reason. */
function ShapeRow({ label, value, options }: { label: string; value: string; options: readonly RowOption[] }) {
  const id = useId();
  const reasons = new Map<string, string>();
  for (const option of options) {
    if (option.reason && !reasons.has(option.reason)) reasons.set(option.reason, `${id}-reason-${reasons.size}`);
  }
  const swatch = options.some(option => option.swatch);
  return <div className="grid justify-items-start gap-1">
    <FieldLabel id={id}>{label}</FieldLabel>
    <ToggleGroup type="single" size="sm" appearance={swatch ? 'swatch' : 'filter'} orientation="horizontal" role="radiogroup"
      aria-labelledby={id} value={value} onValueChange={raw => {
        const option = options.find(item => item.id === raw);
        if (option && !option.reason) option.pick();
      }}>
      {options.map(option => {
        const reasonId = option.reason ? reasons.get(option.reason) : undefined;
        const blocked = { 'aria-disabled': reasonId ? true : undefined, 'aria-describedby': reasonId } as const;
        if (option.swatch) {
          return <ToggleGroupItem key={option.id} value={option.id} aria-label={option.label} title={option.label} {...blocked}>
            <span aria-hidden className={cn('block size-full rounded-full', SWATCH_CLASS[option.swatch], reasonId && 'opacity-50')} />
          </ToggleGroupItem>;
        }
        return <span key={option.id} className={reasonId ? 'inline-flex opacity-50 focus-within:opacity-100' : 'contents'}>
          <ToggleGroupItem value={option.id} appearance="selected-filter" {...blocked}>{option.label}</ToggleGroupItem>
        </span>;
      })}
    </ToggleGroup>
    {[...reasons].map(([reason, reasonId]) => <p key={reasonId} id={reasonId} className="text-xs text-text-secondary">{reason}</p>)}
  </div>;
}

export function PanelShapeSection({ fields, granted, draft, notice, onChange }: PanelSettingsMapping & {
  draft: ChartPanelDraft;
  notice?: Text;
  onChange: (draft: ChartPanelDraft) => void;
}) {
  const { tx } = useI18n();
  const m = useMessages(COMPONENTS_MESSAGES);
  const row = <K extends ShapeKey>(key: K, label: string, options: readonly ShapeOption<K>[]) => {
    const current = options.find(option => option.value === draft[key]) ?? (draft[key] === undefined ? options[0] : undefined);
    return <ShapeRow key={key} label={label} value={current?.id ?? ''} options={options.map(option => ({
      id: option.id, label: option.label, swatch: option.swatch,
      reason: choiceReason(fields, draft, granted, key, option.value, tx),
      pick: () => onChange(withShapeKey(draft, key, option.value)),
    }))} />;
  };
  const labelled = <T extends { label: keyof typeof COMPONENTS_MESSAGES }>(options: readonly T[]) => options.map(option => ({ ...option, label: m(option.label) }));
  return <div className="grid gap-3 break-keep">
    {draft.kind === 'line' && <>
      {row('stack', m('panelShapeStack'), labelled(STACK_OPTIONS))}
      {row('areaFill', m('panelShapeArea'), labelled(AREA_FILL_OPTIONS))}
    </>}
    {draft.kind === 'bar' && <>
      {row('orientation', m('panelShapeDirection'), labelled(ORIENTATION_OPTIONS))}
      {row('color', m('panelShapeColor'), CHART_CONFIG_COLORS.map((color, index) => ({
        id: color, value: color, swatch: color, label: m('panelShapeColorName', { n: String(index + 1) }),
      })))}
    </>}
    {row('decimals', m('panelShapeDecimals'), [
      { id: 'auto', value: undefined, label: m('panelShapeAuto') },
      ...SHAPE_DECIMAL_PLACES.map(place => ({ id: String(place), value: place, label: String(place) })),
    ])}
    {notice && <p role="alert" className="text-xs text-text-danger-label">{tx(notice)}</p>}
  </div>;
}
