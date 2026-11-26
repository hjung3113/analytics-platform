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
  { id: 'auto', areaFill: undefined, label: 'panelShapeAuto' },
  { id: 'off', areaFill: false, label: 'panelShapeOff' },
  { id: 'on', areaFill: true, label: 'panelShapeOn' },
] as const;
/** Digits the shape row offers, taken from the front of `CHART_PANEL_DECIMALS`. */
const SHAPE_DECIMAL_PLACES = CHART_PANEL_DECIMALS.slice(0, 3);
const STACK_OPTIONS = [
  { id: 'none', stack: undefined, label: 'panelShapeStackNone' },
  { id: 'stack', stack: 'stack', label: 'panelShapeStackOn' },
] as const;
const ORIENTATION_OPTIONS = [
  { id: 'vertical', orientation: undefined, label: 'panelShapeVertical' },
  { id: 'horizontal', orientation: 'horizontal', label: 'panelShapeHorizontal' },
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

function isColor(value: ChartPanelDraft[ShapeKey] | undefined): value is ChartConfigColor {
  return CHART_CONFIG_COLORS.some(color => color === value);
}

function isDecimal(value: ChartPanelDraft[ShapeKey] | undefined): value is (typeof SHAPE_DECIMAL_PLACES)[number] {
  return SHAPE_DECIMAL_PLACES.some(place => place === value);
}

/** Writes one shape key, or drops it when `value` is the unwritten default. */
function withShapeKey(draft: ChartPanelDraft, key: ShapeKey, value: ChartPanelDraft[ShapeKey] | undefined): ChartPanelDraft {
  switch (key) {
    case 'stack': {
      const { stack: _stack, ...rest } = draft;
      if (value === 'none' || value === 'stack') return { ...rest, stack: value };
      return rest;
    }
    case 'areaFill': {
      const { areaFill: _areaFill, ...rest } = draft;
      if (typeof value === 'boolean') return { ...rest, areaFill: value };
      return rest;
    }
    case 'orientation': {
      const { orientation: _orientation, ...rest } = draft;
      if (value === 'vertical' || value === 'horizontal') return { ...rest, orientation: value };
      return rest;
    }
    case 'color': {
      const { color: _color, ...rest } = draft;
      if (isColor(value)) return { ...rest, color: value };
      return rest;
    }
    case 'decimals': {
      const { decimals: _decimals, ...rest } = draft;
      if (isDecimal(value)) return { ...rest, decimals: value };
      return rest;
    }
  }
}

/** A choice is blocked only when it adds a problem the key's default does not already have. `incomplete` is not this row's reason. */
function choiceReason(fields: MenuChartFields, draft: ChartPanelDraft, granted: ChartPermissionCheck, key: ShapeKey, value: ChartPanelDraft[ShapeKey] | undefined, tx: (text: Text) => string): string | undefined {
  const problem = chartPanelProblem(fields, withShapeKey(draft, key, value), granted);
  if (!problem || problem.code === 'incomplete') return undefined;
  const cleared = chartPanelProblem(fields, withShapeKey(draft, key, undefined), granted);
  if (cleared?.code === problem.code) return undefined;
  return tx(problem.reason);
}

function ShapeRow({ label, value, options, onPick }: {
  label: string;
  value: string;
  options: readonly { id: string; label: string; reason?: string }[];
  onPick: (id: string) => void;
}) {
  const id = useId();
  const reasons = new Map<string, string>();
  for (const option of options) {
    if (option.reason && !reasons.has(option.reason)) reasons.set(option.reason, `${id}-reason-${reasons.size}`);
  }
  return <div className="grid justify-items-start gap-1">
    <FieldLabel id={id}>{label}</FieldLabel>
    <ToggleGroup type="single" size="sm" appearance="filter" orientation="horizontal" role="radiogroup"
      aria-labelledby={id} value={value} onValueChange={raw => {
        const option = options.find(item => item.id === raw);
        if (!option || option.reason) return;
        onPick(option.id);
      }}>
      {options.map(option => {
        const reasonId = option.reason ? reasons.get(option.reason) : undefined;
        return <span key={option.id} className={reasonId ? 'inline-flex opacity-50 focus-within:opacity-100' : 'contents'}>
          <ToggleGroupItem value={option.id} appearance="selected-filter"
            aria-disabled={reasonId ? true : undefined} aria-describedby={reasonId}>{option.label}</ToggleGroupItem>
        </span>;
      })}
    </ToggleGroup>
    {[...reasons].map(([reason, reasonId]) => <p key={reasonId} id={reasonId} className="text-xs text-text-secondary">{reason}</p>)}
  </div>;
}

function ColorSwatches({ label, value, options, names, onPick }: {
  label: string;
  value: ChartConfigColor;
  options: readonly { id: ChartConfigColor; reason?: string }[];
  names: (color: ChartConfigColor, index: number) => string;
  onPick: (color: ChartConfigColor) => void;
}) {
  const id = useId();
  const reasons = new Map<string, string>();
  for (const option of options) {
    if (option.reason && !reasons.has(option.reason)) reasons.set(option.reason, `${id}-reason-${reasons.size}`);
  }
  return <div className="grid justify-items-start gap-1">
    <FieldLabel id={id}>{label}</FieldLabel>
    <ToggleGroup type="single" appearance="swatch" orientation="horizontal" role="radiogroup" aria-labelledby={id} value={value}
      onValueChange={raw => {
        const option = options.find(item => item.id === raw);
        if (!option || option.reason) return;
        onPick(option.id);
      }}>
      {options.map((option, index) => {
        const reasonId = option.reason ? reasons.get(option.reason) : undefined;
        return <ToggleGroupItem key={option.id} value={option.id} aria-label={names(option.id, index)}
          aria-disabled={reasonId ? true : undefined} aria-describedby={reasonId}>
          <span aria-hidden className={cn('block size-full rounded-full', SWATCH_CLASS[option.id], reasonId && 'opacity-50')} />
        </ToggleGroupItem>;
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
  const reason = (key: ShapeKey, value: ChartPanelDraft[ShapeKey] | undefined) => choiceReason(fields, draft, granted, key, value, tx);
  const decimals = [
    { id: 'auto', decimals: undefined },
    ...SHAPE_DECIMAL_PLACES.map(place => ({ id: String(place), decimals: place })),
  ];
  const decimalId = draft.decimals === undefined ? 'auto' : String(draft.decimals);
  const area = AREA_FILL_OPTIONS.find(option => option.areaFill === draft.areaFill) ?? AREA_FILL_OPTIONS[0];
  return <div className="grid gap-3 break-keep">
    {draft.kind === 'line' && <>
      <ShapeRow label={m('panelShapeStack')} value={draft.stack === 'stack' ? 'stack' : 'none'}
        options={STACK_OPTIONS.map(option => ({ id: option.id, label: m(option.label), reason: reason('stack', option.stack) }))}
        onPick={id => {
          const option = STACK_OPTIONS.find(item => item.id === id);
          if (option) onChange(withShapeKey(draft, 'stack', option.stack));
        }} />
      <ShapeRow label={m('panelShapeArea')} value={area.id}
        options={AREA_FILL_OPTIONS.map(option => ({ id: option.id, label: m(option.label), reason: reason('areaFill', option.areaFill) }))}
        onPick={id => {
          const option = AREA_FILL_OPTIONS.find(item => item.id === id);
          if (option) onChange(withShapeKey(draft, 'areaFill', option.areaFill));
        }} />
    </>}
    {draft.kind === 'bar' && <>
      <ShapeRow label={m('panelShapeDirection')} value={draft.orientation === 'horizontal' ? 'horizontal' : 'vertical'}
        options={ORIENTATION_OPTIONS.map(option => ({ id: option.id, label: m(option.label), reason: reason('orientation', option.orientation) }))}
        onPick={id => {
          const option = ORIENTATION_OPTIONS.find(item => item.id === id);
          if (option) onChange(withShapeKey(draft, 'orientation', option.orientation));
        }} />
      <ColorSwatches label={m('panelShapeColor')} value={draft.color ?? DEFAULT_SERIES}
        names={(color, index) => m('panelShapeColorName', { n: String(index + 1) })}
        options={CHART_CONFIG_COLORS.map(color => ({ id: color, reason: reason('color', color === DEFAULT_SERIES ? undefined : color) }))}
        onPick={color => onChange(withShapeKey(draft, 'color', color === DEFAULT_SERIES ? undefined : color))} />
    </>}
    <ShapeRow label={m('panelShapeDecimals')} value={decimalId}
      options={decimals.map(option => ({
        id: option.id,
        label: option.decimals === undefined ? m('panelShapeAuto') : option.id,
        reason: reason('decimals', option.decimals),
      }))}
      onPick={id => {
        const option = decimals.find(item => item.id === id);
        if (option) onChange(withShapeKey(draft, 'decimals', option.decimals));
      }} />
    {notice && <p role="alert" className="text-xs text-text-danger-label">{tx(notice)}</p>}
  </div>;
}
