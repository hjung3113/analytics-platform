import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link2, SlidersHorizontal } from 'lucide-react';
import {
  createChartPanel, invalidMenuViewPanels, readChartPanel, readChartPanelDraft, sameChartConfig,
  type AnalysisSelection, type ChartConfig, type ChartPanelDraft, type ChartPanelProblem, type ChartPermissionCheck, type MenuChartFields,
  type MenuViewPanels, type PanelDeclaration, type PanelInstance, type PanelInstanceInput, type PanelInstanceOutput, type Text,
} from '@ap/contracts';
import { useI18n, useMessages, usePlatformOptional } from '@ap/kernel';
import { FieldLabel, ToggleGroup, ToggleGroupItem } from '@ap/ui';
import { DetailDrawer } from '../drawer/DetailDrawer';
import { Inspector } from '../inspector/Inspector';
import { COMPONENTS_MESSAGES } from '../messages';
import { PanelMappingSection } from './PanelMappingSection';

type DeclaredInput = NonNullable<PanelDeclaration['queryInputs']['page']>[number];
type Source = { panel: PanelInstance; output: PanelInstanceOutput };
export type PanelSettingsMapping = { fields: MenuChartFields; granted: ChartPermissionCheck };
export type PanelSettingsDrawerProps = {
  title: Text;
  panel: PanelInstance;
  value: MenuViewPanels;
  /** Enables the mapping section for chart panels made from this menu's fields. */
  mapping?: PanelSettingsMapping;
  /** Builds the graph to validate and emit when the caller's save slot projects the edited panel. */
  projectCandidate?: (panel: PanelInstance) => MenuViewPanels;
  /** Optionally rejects a projected configuration with a localized reason before SDK validation. */
  validateCandidate?: (candidate: MenuViewPanels) => Text | undefined;
  /** Reports a rejected mapping draft to the Save owner. Clears the reason once accepted or discarded. */
  onValidationChange?: (reason: Text | undefined) => void;
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
type EditSection = 'mapping' | 'connections';
type RejectedEdit = {
  key: string;
  config: ChartConfig | undefined;
  draft?: ChartPanelDraft;
  section: EditSection;
  reason: Text;
  problem?: ChartPanelProblem;
};

function changesConnectedOutput(panel: PanelInstance, candidate: MenuViewPanels): boolean {
  const outputs = candidate.instances.find(instance => instance.id === panel.id)?.outputs;
  return panel.outputs.some(output => {
    const replacement = outputs?.find(item => item.key === output.key);
    if (replacement?.dimension === output.dimension && replacement.shape === output.shape) return false;
    const from = reference({ panel, output });
    return candidate.instances.some(instance => instance.inputs.some(input => input.from === from));
  });
}

function Segments<T extends string>({ label, options, value, disabled, text, onChange }: {
  label: string; options: readonly T[]; value: T; disabled?: (option: T) => boolean;
  text: (option: T) => string; onChange: (option: T) => void;
}) {
  const id = useId();
  return <div className="grid justify-items-start gap-1">
    <FieldLabel id={id}>{label}</FieldLabel>
    <ToggleGroup type="single" size="sm" appearance="filter" orientation="horizontal"
      aria-labelledby={id} role="radiogroup" value={value} onValueChange={raw => {
        const choice = options.find(option => option === raw);
        if (choice !== undefined) onChange(choice);
      }}>
      {options.map(option => <ToggleGroupItem key={option} value={option} appearance="selected-filter" disabled={disabled?.(option)}>{text(option)}</ToggleGroupItem>)}
    </ToggleGroup>
  </div>;
}

/** Edits one instance in a v1 panel configuration. The caller supplies the live selection and owns the saved-view slot. */
export function PanelSettingsDrawer({ title, panel, value, mapping, projectCandidate, validateCandidate, onValidationChange, declaredInputs = [], sourceReference, sourceTitle, outputLabel, selectionOf, trigger, onChange, onClose }: PanelSettingsDrawerProps) {
  const m = useMessages(COMPONENTS_MESSAGES);
  const { tx } = useI18n();
  const platform = usePlatformOptional();
  const config = mapping && panel.source.kind === 'chart' ? panel.source.config : undefined;
  const editKey = JSON.stringify([panel.id, platform?.route?.menu.id, platform?.session.user.id, platform?.revision, platform?.scope.scopeId]);
  const [edit, setEdit] = useState<RejectedEdit | null>(null);
  // A caller can re-read the same saved chart while the drawer is open.
  const rejection = edit?.key === editKey && sameChartConfig(edit.config, config) ? edit : null;
  if (edit && !rejection) setEdit(null);
  const pendingDraft = rejection?.draft;
  const blockingReason = onValidationChange && pendingDraft ? rejection.reason : undefined;
  // Reporting a reason can rerender the Save owner with a new callback.
  const validationListener = useRef(onValidationChange);
  useEffect(() => {
    validationListener.current = onValidationChange;
  }, [onValidationChange]);
  useEffect(() => {
    if (!blockingReason) return;
    validationListener.current?.(blockingReason);
    return () => validationListener.current?.(undefined);
  }, [blockingReason]);
  const saved = config && mapping ? readChartPanel(mapping.fields, panel, mapping.granted) : undefined;
  const savedProblem = saved?.status === 'problem' ? saved.problem : null;
  const draft = pendingDraft ?? (config && readChartPanelDraft(config));
  const mappingProblem = pendingDraft ? rejection.problem ?? null : savedProblem;
  const returnFocusRef = useMemo(() => ({ current: trigger ?? null }), [trigger]);
  const inputKeys = new Set([...declaredInputs.filter(input => input.selection).map(input => input.key), ...panel.inputs.map(input => input.key)]);
  const sources = value.instances.filter(instance => instance.id !== panel.id).flatMap(instance => instance.outputs.map(output => ({ panel: instance, output })));
  const labelOf = (source: Source) => {
    const label = outputLabel?.(source) ?? mapping?.fields.breakdowns.find(field => field.dimension === source.output.dimension)?.label;
    return label ? tx(label) : source.output.dimension;
  };
  const save = (updated: PanelInstance, section: EditSection, nextDraft?: ChartPanelDraft) => {
    const reject = (reason: Text, problem?: ChartPanelProblem) => setEdit({ key: editKey, config, draft: nextDraft, section, reason, problem });
    if (nextDraft && mapping) {
      const built = createChartPanel(mapping.fields, nextDraft, panel.id, mapping.granted);
      if (built.status === 'problem') {
        reject(built.problem.reason, built.problem);
        return;
      }
      updated = { ...built.instance, inputs: updated.inputs };
    } else if (savedProblem) {
      reject(savedProblem.reason);
      return;
    }
    const candidate = projectCandidate?.(updated)
      ?? { ...value, instances: value.instances.map(instance => {
        if (instance.id !== panel.id) return instance;
        return nextDraft ? updated : { ...instance, inputs: updated.inputs };
      }) };
    let reason = validateCandidate?.(candidate);
    if (!reason && nextDraft && changesConnectedOutput(panel, candidate)) reason = COMPONENTS_MESSAGES.panelMappingDisconnectReaders;
    if (!reason) {
      const problem = invalidMenuViewPanels(candidate);
      if (problem) {
        if (problem === 'panels connections must not contain a filter cycle') reason = COMPONENTS_MESSAGES.panelFilterCycle;
        else reason = COMPONENTS_MESSAGES[nextDraft ? 'panelMappingInvalid' : 'panelConnectionInvalid'];
      }
    }
    if (reason) reject(reason);
    else {
      setEdit(null);
      onChange(candidate);
    }
  };
  const update = (key: string, next?: PanelInstanceInput) => {
    const inputs = [...panel.inputs];
    const index = inputs.findIndex(input => input.key === key);
    if (index < 0 && next) inputs.push(next);
    if (index >= 0) inputs.splice(index, 1, ...(next ? [next] : []));
    save({ ...panel, inputs }, 'connections', pendingDraft);
  };
  const mappingSection = mapping && draft ? {
    id: 'mapping', title: COMPONENTS_MESSAGES.panelMapping, icon: SlidersHorizontal,
    render: () => <PanelMappingSection key={editKey} {...mapping} draft={draft} problem={mappingProblem}
      candidateError={rejection?.section === 'mapping' && !rejection.problem ? rejection.reason : undefined}
      onChange={next => save(panel, 'mapping', next)} />,
  } : undefined;
  const content = <Inspector key={mappingSection ? panel.id : undefined} form="stack" label={COMPONENTS_MESSAGES.panelSettings} sections={[...(mappingSection ? [mappingSection] : []), {
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
      {rejection?.section === 'connections' && <p role="alert" className="text-xs text-text-danger-label">{tx(rejection.reason)}</p>}
    </div>,
  }]} />;
  return <DetailDrawer title={tx(title)} focusOnOpen closeOnSuperseded copyPage={null} returnFocusRef={returnFocusRef} onClose={onClose}
    tabs={[{ id: 'settings', label: m('panelSettings'), content }]} />;
}
