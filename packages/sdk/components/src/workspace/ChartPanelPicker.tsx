import { useId, useState } from 'react';
import { CHART_PANEL_KINDS, chartPanelProblem, chartPanelTitle, createChartPanel, nextChartPanelId,
  type ChartPanelDraft, type ChartPanelProblem, type ChartPermissionCheck, type MenuChartFields, type PanelInstance } from '@ap/contracts';
import { Button, ToggleGroup, ToggleGroupItem } from '@ap/ui';
import { useI18n, useMessages } from '@ap/kernel';
import { COMPONENTS_MESSAGES } from '../messages';

type Choice = { id: string; label: string; reason?: string };
const CHIP_COLUMNS = 2;

function ChipGroup({ label, choices, value, onPick }: {
  label: string; choices: readonly Choice[]; value: string; onPick: (id: string) => void;
}) {
  const id = useId();
  return <div className="min-w-0">
    <div id={id} className="mb-1.5 text-xs font-medium">{label}</div>
    <ToggleGroup type="single" aria-labelledby={id} arrowSelects={false} variant="outline" size="sm" value={value}
      onValueChange={next => { if (choices.some(choice => choice.id === next && choice.reason === undefined)) onPick(next); }}
      className="grid grid-cols-2 items-stretch" onKeyDownCapture={event => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        const chips = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
        const index = chips.findIndex(chip => chip === event.target);
        if (index < 0) return;
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? CHIP_COLUMNS : -CHIP_COLUMNS;
        chips[index + step]?.focus();
      }}>
      {choices.map((choice, index) => <ToggleGroupItem key={choice.id} value={choice.id} aria-label={choice.label}
        aria-disabled={choice.reason !== undefined || undefined} aria-describedby={choice.reason ? `${id}-${index}` : undefined}
        appearance="selected-filter" className="h-auto min-h-9 break-keep">
        <span className="flex flex-col py-1 text-xs">
          <span className={choice.reason ? 'text-text-muted' : undefined}>{choice.label}</span>
          {choice.reason && <span id={`${id}-${index}`} className="text-text-muted">{choice.reason}</span>}
        </span>
      </ToggleGroupItem>)}
    </ToggleGroup>
  </div>;
}

const kindMessage = { line: 'chartPanelKindLine', bar: 'chartPanelKindBar' } as const;
const chipProblem = (problem: ChartPanelProblem | null) => problem?.code === 'incomplete' ? null : problem;

export function ChartPanelPicker({ fields, granted, existingIds, onAdd }: {
  fields: MenuChartFields; granted: ChartPermissionCheck; existingIds: readonly string[]; onAdd: (instance: PanelInstance) => void;
}) {
  const m = useMessages(COMPONENTS_MESSAGES);
  const { tx } = useI18n();
  const [draft, setDraft] = useState<ChartPanelDraft>();
  const kinds = CHART_PANEL_KINDS.filter(kind => !chipProblem(chartPanelProblem(fields, { kind }, granted)));
  const problem = draft && chartPanelProblem(fields, draft, granted);
  const measure = fields.measures.find(field => field.id === draft?.measure);
  const breakdown = fields.breakdowns.find(field => field.id === draft?.breakdown);
  const title = problem === null && measure && breakdown ? tx(chartPanelTitle(measure, breakdown)) : undefined;
  const detail = (candidate: ChartPanelDraft) => {
    const issue = chipProblem(chartPanelProblem(fields, candidate, granted));
    return issue ? tx(issue.reason) : undefined;
  };
  // Judge measures on their own. A new measure can make the chosen breakdown invalid, with the reason on that breakdown.
  const breakdownMeasure = draft && !detail({ kind: draft.kind, measure: draft.measure }) ? draft.measure : undefined;
  return <section className="border-t border-border-subtle pt-3">
    <div className="mb-3 font-semibold">{m('chartPanelCreate')}</div>
    <div className="grid grid-cols-[minmax(0,1fr)_repeat(2,minmax(0,2.1fr))] gap-3">
      <ChipGroup label={m('chartPanelKind')} value={draft?.kind ?? ''} choices={kinds.map(kind => ({ id: kind, label: m(kindMessage[kind]) }))}
        onPick={id => { const kind = kinds.find(choice => choice === id); if (kind) setDraft({ ...draft, kind }); }} />
      {draft && <>
        <ChipGroup label={m('chartPanelMeasure')} value={draft.measure ?? ''} onPick={id => { setDraft({ ...draft, measure: id }); }}
          choices={fields.measures.map(field => ({ id: field.id, label: tx(field.label), reason: detail({ kind: draft.kind, measure: field.id }) }))} />
        <ChipGroup label={m('chartPanelBreakdown')} value={draft.breakdown ?? ''} onPick={id => { setDraft({ ...draft, breakdown: id }); }}
          choices={fields.breakdowns.map(field => ({ id: field.id, label: tx(field.label), reason: detail({ kind: draft.kind, measure: breakdownMeasure, breakdown: field.id }) }))} />
      </>}
    </div>
    {draft && <div className="mt-3 flex items-center justify-end gap-3">
      <span aria-live="polite" className="break-keep text-text-secondary">{title}</span>
      <Button type="button" size="toolbar" disabled={problem !== null} onClick={() => {
        const created = createChartPanel(fields, draft, nextChartPanelId(existingIds), granted);
        if (created.status === 'ok') onAdd(created.instance);
      }}>{m('chartPanelAdd')}</Button>
    </div>}
  </section>;
}
