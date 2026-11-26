import { useId } from 'react';
import { X } from 'lucide-react';
import {
  assignMappingSlot, chartPanelProblem, CHART_PANEL_KINDS, mappingSlotProblem,
  type ChartConfig, type ChartPanelDraft, type ChartPanelProblem, type MappingChip, type MappingSlot, type Text,
} from '@ap/contracts';
import { useI18n, useMessages } from '@ap/kernel';
import { FieldLabel, ToggleGroup, ToggleGroupItem, cn } from '@ap/ui';
import { COMPONENTS_MESSAGES } from '../messages';
import type { PanelSettingsMapping } from './PanelSettingsDrawer';
import { useMappingDrag } from './useMappingDrag';

const kindLabels = { line: 'panelMappingLine', bar: 'panelMappingBar' } as const;
const problemSlots: Partial<Record<ChartPanelProblem['code'], MappingSlot>> = {
  'unknown-measure': 'measure',
  'measure-denied': 'measure',
  'not-additive': 'measure',
  'unknown-breakdown': 'breakdown',
  'breakdown-not-offered': 'breakdown',
  'stack-needs-series': 'breakdown',
};
const rowClass = 'grid grid-cols-3 items-center gap-2 text-xs';
const chipDragClass = 'cursor-grab touch-none select-none active:cursor-grabbing';
type DropPreview = { reason: string | undefined; hovered: boolean };

function MappingWell({ slot, label, fieldId, field, problem, drop, refusalReasons, onClear }: {
  slot: MappingSlot; label: string; fieldId: string | undefined; field: string | undefined;
  problem: string | undefined; drop: DropPreview | undefined; refusalReasons: ReadonlySet<string>; onClear: () => void;
}) {
  const id = useId();
  const m = useMessages(COMPONENTS_MESSAGES);
  const describedBy = [problem && `${id}-problem`, drop?.reason && `${id}-drop`].filter(Boolean).join(' ') || undefined;
  return <div className={rowClass}>
    <span id={`${id}-label`} className="self-start pt-3 text-text-secondary">{label}</span>
    <div className="col-span-2 min-w-0">
      <div role="group" tabIndex={-1} aria-labelledby={`${id}-label`} aria-invalid={problem ? true : undefined}
        aria-describedby={describedBy} data-mapping-slot={slot}
        className={cn('flex min-h-10 items-center rounded-md border bg-surface-sunken px-2 py-1 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring',
          field === undefined ? 'border-dashed border-border-control' : 'border-border-subtle',
          drop?.reason && 'bg-surface-canvas',
          drop && !drop.reason && 'border-solid border-accent-primary ring-1 ring-accent-primary ring-inset',
          drop?.hovered && !drop.reason && 'bg-accent-primary-soft/35')}>
        {field === undefined
          ? <span className="text-text-secondary">{m('panelMappingEmpty')}</span>
          : <span className={cn('inline-flex min-w-0 items-center rounded-full border pl-2',
            problem ? 'border-border-subtle text-text-muted' : 'border-border-selected bg-surface-row-selected text-text-primary',
            drop?.reason && 'border-border-subtle bg-surface-canvas text-text-secondary')}>
            <span key={fieldId} data-mapping-chip={fieldId} data-mapping-chip-kind={slot}
              className={cn('min-w-0 break-words', chipDragClass)}>{field}</span>
            <button type="button" aria-label={m('panelMappingClear', { label: field })}
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-full hover:text-text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring"
              onClick={event => {
                event.currentTarget.closest<HTMLElement>('[data-mapping-slot]')?.focus();
                onClear();
              }}><X aria-hidden className="size-3.5" /></button>
          </span>}
      </div>
      {problem && <p id={`${id}-problem`} role="alert" className="mt-1 text-xs text-text-danger-label">{problem}</p>}
      {/* The tallest localized reason sizes this cell before any drag starts. */}
      <div className="grid min-h-9 grid-cols-1 pt-1 leading-4 text-text-secondary wrap-anywhere">
        {[...refusalReasons].map(reason => {
          const visible = reason === drop?.reason;
          return <p key={reason} id={visible ? `${id}-drop` : undefined} aria-hidden={visible ? undefined : true}
            className={cn('col-start-1 row-start-1', !visible && 'invisible')}>{reason}</p>;
        })}
      </div>
    </div>
  </div>;
}

function MappingShelfGroup({ slot, label, fields, granted, draft, onAssign }: PanelSettingsMapping & {
  slot: MappingSlot; label: string; draft: ChartPanelDraft; onAssign: (slot: MappingSlot, chip: MappingChip) => void;
}) {
  const id = useId();
  const { tx } = useI18n();
  const declarations = slot === 'measure' ? fields.measures : fields.breakdowns;
  const reasons = new Map<string, string>();
  const chips = declarations.map(field => {
    const chip = { kind: slot, id: field.id };
    const problem = mappingSlotProblem(fields, draft, slot, chip, granted);
    if (!problem) return { field, chip };
    const reason = tx(problem);
    const reasonId = reasons.get(reason) ?? `${id}-reason-${reasons.size}`;
    reasons.set(reason, reasonId);
    return { field, chip, reasonId };
  });
  return <div role="group" aria-labelledby={`${id}-title`} className="grid gap-1">
    <span id={`${id}-title`} className="text-xs text-text-secondary">{label}</span>
    <div className="flex flex-wrap gap-1.5">
      {chips.map(({ field, chip, reasonId }) => <button key={field.id} type="button"
        aria-pressed={draft[slot] === field.id} aria-disabled={reasonId ? true : undefined} aria-describedby={reasonId}
        data-mapping-chip={field.id} data-mapping-chip-kind={slot}
        className={cn('min-h-8 max-w-full rounded-md border border-border-subtle bg-surface-card px-3 py-1 text-xs font-medium',
          'text-text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring',
          'aria-pressed:border-border-selected aria-pressed:bg-surface-row-selected',
          chipDragClass, reasonId ? 'text-text-disabled' : 'hover:bg-surface-row-hover')}
        onClick={() => onAssign(slot, chip)}>{tx(field.label)}</button>)}
    </div>
    {[...reasons].map(([reason, reasonId]) => <p key={reasonId} id={reasonId} className="text-xs text-text-secondary">{reason}</p>)}
  </div>;
}

export function PanelMappingSection({ fields, granted, config, draft, problem, candidateError, onChange }: PanelSettingsMapping & {
  config: ChartConfig; draft: ChartPanelDraft; problem: ChartPanelProblem | null; candidateError: Text | undefined; onChange: (draft: ChartPanelDraft) => void;
}) {
  const id = useId();
  const { tx } = useI18n();
  const m = useMessages(COMPONENTS_MESSAGES);
  const assign = (slot: MappingSlot, chip: MappingChip) => {
    const refusal = mappingSlotProblem(fields, draft, slot, chip, granted);
    if (!refusal && draft[slot] !== chip.id) onChange(assignMappingSlot(draft, slot, chip));
    return refusal;
  };
  const drag = useMappingDrag(config, assign);
  const retry = drag.status?.kind === 'retry';
  const statusText = drag.status?.kind === 'refused' ? tx(drag.status.reason) : undefined;
  const dropPreview = (slot: MappingSlot): DropPreview | undefined => {
    if (!drag.preview) return;
    const reason = mappingSlotProblem(fields, draft, slot, drag.preview.chip, granted);
    return { reason: reason && tx(reason), hovered: drag.preview.slot === slot };
  };
  const refusalReasons = (slot: MappingSlot) => {
    const sameKind = slot === 'measure' ? fields.measures : fields.breakdowns;
    const otherKind = slot === 'measure' ? 'breakdown' : 'measure';
    const otherFields = otherKind === 'measure' ? fields.measures : fields.breakdowns;
    const reasons = new Set<string>();
    const addReason = (chip: MappingChip) => {
      const reason = mappingSlotProblem(fields, draft, slot, chip, granted);
      if (reason) reasons.add(tx(reason));
    };
    for (const fieldId of new Set([...sameKind.map(field => field.id), draft[slot]])) {
      if (fieldId !== undefined) addReason({ kind: slot, id: fieldId });
    }
    // The wrong-kind reason is the same for every chip of that kind.
    const otherFieldId = otherFields[0]?.id ?? draft[otherKind];
    if (otherFieldId !== undefined) addReason({ kind: otherKind, id: otherFieldId });
    return reasons;
  };
  const kinds = CHART_PANEL_KINDS.map(kind => {
    const result = chartPanelProblem(fields, { kind }, granted);
    return { kind, reason: result?.code === 'incomplete' ? undefined : result?.reason };
  });
  const measure = fields.measures.find(field => field.id === draft.measure);
  const breakdown = fields.breakdowns.find(field => field.id === draft.breakdown);
  const problemSlot = problem ? problemSlots[problem.code] : undefined;
  const slotProblem = (slot: MappingSlot) => problem && problemSlot === slot ? tx(problem.reason) : undefined;
  const generalError = problem && !problemSlot ? problem.reason : candidateError;
  const isIncomplete = problem?.code === 'incomplete';
  const timeLabel = fields.time ? tx(fields.time.label) : undefined;
  return <div className="grid gap-3 break-keep" onPointerDown={drag.onPointerDown}>
    <div className="grid justify-items-start gap-1">
      <FieldLabel id={`${id}-kind`}>{m('panelMappingKind')}</FieldLabel>
      <ToggleGroup type="single" size="sm" appearance="filter" orientation="horizontal" role="radiogroup"
        aria-labelledby={`${id}-kind`} value={draft.kind} onValueChange={value => {
          const option = kinds.find(({ kind }) => kind === value);
          if (option && !option.reason) onChange({ ...draft, kind: option.kind });
        }}>
        {kinds.map(({ kind, reason }) => <ToggleGroupItem key={kind} value={kind} appearance="selected-filter" disabled={Boolean(reason)}
          aria-describedby={reason ? `${id}-${kind}-reason` : undefined}>{m(kindLabels[kind])}</ToggleGroupItem>)}
      </ToggleGroup>
      {kinds.map(({ kind, reason }) => reason &&
        <p key={kind} id={`${id}-${kind}-reason`} className="text-xs text-text-secondary">{tx(reason)}</p>)}
    </div>
    <div className="grid gap-2.5">
      <MappingWell slot="measure" label={m('panelMappingY')} fieldId={draft.measure} field={measure ? tx(measure.label) : draft.measure}
        problem={slotProblem('measure')} drop={dropPreview('measure')} refusalReasons={refusalReasons('measure')}
        onClear={() => onChange({ ...draft, measure: undefined })} />
      <MappingWell slot="breakdown" label={m(draft.kind === 'line' ? 'panelMappingColor' : 'panelMappingCategory')}
        fieldId={draft.breakdown} field={breakdown ? tx(breakdown.label) : draft.breakdown} problem={slotProblem('breakdown')}
        drop={dropPreview('breakdown')} refusalReasons={refusalReasons('breakdown')}
        onClear={() => onChange({ ...draft, breakdown: undefined })} />
      <div role="group" aria-labelledby={`${id}-axis`} aria-describedby={`${id}-axis-reason`} className={rowClass}>
        <span id={`${id}-axis`} className="text-text-secondary">{m('panelMappingX')}</span>
        <span className="col-span-2">{draft.kind === 'line' ? timeLabel : m('panelMappingXBreakdown')}</span>
        <span id={`${id}-axis-reason`} className="sr-only">{m('panelMappingXReason')}</span>
      </div>
    </div>
    <div className="grid gap-2.5 border-t border-border-subtle pt-3">
      <p className="text-sm font-semibold">{m('panelMappingFields')}</p>
      <MappingShelfGroup slot="measure" label={m('panelMappingMeasure')} fields={fields} granted={granted} draft={draft} onAssign={assign} />
      <MappingShelfGroup slot="breakdown" label={m('panelMappingBreakdown')} fields={fields} granted={granted} draft={draft} onAssign={assign} />
    </div>
    {generalError && <p role="alert" className={isIncomplete ? 'sr-only' : 'text-xs text-text-danger-label'}>{tx(generalError)}</p>}
    <div className="pointer-events-none sticky bottom-2 z-10 h-0">
      <p role="status" className={retry
        ? 'absolute inset-x-2 bottom-0 mx-auto w-fit rounded-md border border-border-subtle bg-surface-canvas px-2 py-1 text-center t-caption text-text-secondary break-keep'
        : 'sr-only'}>{retry ? m('panelMappingDropTargetChanged') : statusText}</p>
    </div>
  </div>;
}
