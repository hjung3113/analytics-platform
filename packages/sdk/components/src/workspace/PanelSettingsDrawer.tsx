import { useId, useMemo, useState } from 'react';
import { Link2 } from 'lucide-react';
import { invalidMenuViewPanels, type AnalysisSelection, type MenuViewPanels, type PanelDeclaration, type PanelInstance, type PanelInstanceInput, type PanelInstanceOutput, type Text } from '@ap/contracts';
import { useI18n, useMessages } from '@ap/kernel';
import { FieldLabel, ToggleGroup, ToggleGroupItem } from '@ap/ui';
import { DetailDrawer } from '../drawer/DetailDrawer';
import { Inspector } from '../inspector/Inspector';
import { COMPONENTS_MESSAGES } from '../messages';

type DeclaredInput = NonNullable<PanelDeclaration['queryInputs']['page']>[number];
type Source = { panel: PanelInstance; output: PanelInstanceOutput };
export type PanelSettingsDrawerProps = {
  title: Text;
  panel: PanelInstance;
  value: MenuViewPanels;
  declaredInputs?: readonly DeclaredInput[];
  /** Eligible publisher for a new input, as `<instance id>.<output key>`. Saved inputs keep their own reference. */
  sourceReference?: (inputKey: string) => string | undefined;
  sourceTitle?: (panel: PanelInstance) => Text | undefined;
  outputLabel?: (source: Source) => Text | undefined;
  selectionOf: (source: Source) => AnalysisSelection | null;
  trigger?: HTMLButtonElement;
  onChange: (value: MenuViewPanels) => void;
  onClose: () => void;
};

const receivingModes = ['filter', 'highlight', 'ignore'] as const;
const followModes = ['follow', 'hold'] as const;
const receivingLabels = { filter: 'panelFilter', highlight: 'panelHighlight', ignore: 'panelIgnore' } as const;
const reference = ({ panel, output }: Source) => `${panel.id}.${output.key}`;

function Segments<T extends string>({ label, options, value, disabled, text, onChange }: {
  label: string; options: readonly T[]; value: T; disabled?: (option: T) => boolean;
  text: (option: T) => string; onChange: (option: T) => void;
}) {
  const id = useId();
  return <div className="grid justify-items-start gap-1">
    <FieldLabel id={id}>{label}</FieldLabel>
    <ToggleGroup type="single" variant="outline" size="sm" appearance="filter" orientation="horizontal"
      aria-labelledby={id} role="radiogroup" value={value} onValueChange={raw => {
        const choice = options.find(option => option === raw);
        if (choice !== undefined) onChange(choice);
      }}>
      {options.map(option => <ToggleGroupItem key={option} value={option} appearance="selected-filter" disabled={disabled?.(option)}>{text(option)}</ToggleGroupItem>)}
    </ToggleGroup>
  </div>;
}

/** Edits one instance in a v1 panel configuration. The caller supplies the live selection and owns the saved-view slot. */
export function PanelSettingsDrawer({ title, panel, value, declaredInputs = [], sourceReference, sourceTitle, outputLabel, selectionOf, trigger, onChange, onClose }: PanelSettingsDrawerProps) {
  const m = useMessages(COMPONENTS_MESSAGES);
  const { tx } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const returnFocusRef = useMemo(() => ({ current: trigger ?? null }), [trigger]);
  const inputKeys = new Set([...declaredInputs.filter(input => input.selection).map(input => input.key), ...panel.inputs.map(input => input.key)]);
  const sources = value.instances.filter(instance => instance.id !== panel.id).flatMap(instance => instance.outputs.map(output => ({ panel: instance, output })));
  const labelOf = (source: Source) => {
    const label = outputLabel?.(source);
    return label ? tx(label) : source.output.dimension;
  };
  const update = (key: string, next?: PanelInstanceInput) => {
    const inputs = [...panel.inputs];
    const index = inputs.findIndex(input => input.key === key);
    if (index < 0 && next) inputs.push(next);
    if (index >= 0) inputs.splice(index, 1, ...(next ? [next] : []));
    const candidate = { ...value, instances: value.instances.map(instance => instance.id === panel.id ? { ...instance, inputs } : instance) };
    const problem = invalidMenuViewPanels(candidate);
    setError(problem);
    if (!problem) onChange(candidate);
  };
  const content = <Inspector form="stack" label={COMPONENTS_MESSAGES.panelSettings} sections={[{
    id: 'connections', title: COMPONENTS_MESSAGES.panelConnections, icon: Link2,
    render: () => <div className="grid gap-3 break-keep">
      {[...inputKeys].map(key => {
        const input = panel.inputs.find(item => item.key === key);
        const declared = declaredInputs.find(item => item.key === key);
        const from = input?.from ?? sourceReference?.(key);
        const source = sources.find(item => reference(item) === from);
        const mode = input ? (input.use ?? declared?.selection ?? 'filter') : 'ignore';
        const live = source && selectionOf(source);
        const held = input?.mode === 'hold' ? input.value : null;
        const publisher = source && sourceTitle?.(source.panel);
        const fallbackLabel = declared?.label ? tx(declared.label) : key;
        const inputLabel = source ? labelOf(source) : fallbackLabel;
        return <div key={key} role="group" aria-label={inputLabel} className="grid gap-2">
          <p className="text-xs text-text-secondary">{m('panelReceives')} · {publisher && <>{tx(publisher)} · </>}{inputLabel}</p>
          <Segments label={m('panelReceivingMode')} options={receivingModes} value={mode} disabled={choice => !source && choice !== 'ignore'}
            text={choice => m(receivingLabels[choice])}
            onChange={use => {
              if (use === 'ignore') update(key);
              else if (source) update(key, { ...(input ?? { key, from: reference(source), mode: 'follow' }), use });
            }} />
          <Segments label={m('panelFollowMode')} options={followModes} value={input?.mode ?? 'follow'}
            disabled={choice => !input || (choice === 'hold' && !held && !live)} text={choice => m(choice === 'follow' ? 'panelFollow' : 'panelHold')}
            onChange={mode => {
              if (!input) return;
              const base = { key, from: input.from, ...(input.use ? { use: input.use } : {}) };
              if (mode === 'follow') update(key, { ...base, mode });
              if (mode === 'hold' && live) update(key, { ...base, mode, value: live });
            }} />
          {!source && <p className="text-xs text-text-secondary">{m('panelMissingSource')}</p>}
          {held && <p className="text-xs text-text-secondary break-words">{m('panelHeldValue')} · <span>{held.shape === 'set' ? held.values.join(', ') : `${held.from} – ${held.to}`}</span></p>}
        </div>;
      })}
      <p className="text-xs text-text-secondary">{m('panelPublishes')} · {panel.outputs.length
        ? panel.outputs.map(output => labelOf({ panel, output })).join(', ') : m('panelNoOutputs')}</p>
      {error && <p role="alert" className="text-xs text-text-danger-label">{m(error === 'panels connections must not contain a filter cycle' ? 'panelFilterCycle' : 'panelConnectionInvalid')}</p>}
    </div>,
  }]} />;
  return <DetailDrawer title={tx(title)} focusOnOpen closeOnSuperseded copyPage={null} returnFocusRef={returnFocusRef} onClose={onClose}
    tabs={[{ id: 'settings', label: m('panelSettings'), content }]} />;
}
