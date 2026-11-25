import { useContext, useId, useRef, type ReactNode, type Ref } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { AnalysisSelection } from '@ap/contracts';
import { useDrill, useI18n, useMessages, usePlatform, usePlatformOptional } from '@ap/kernel';
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@ap/ui';
import { COMPONENTS_MESSAGES } from '../messages';
import { AnalysisPanelAddContext, type AnalysisPanelDestinations } from '../workspace/PanelAdd';
import { usePublishNextAnalysis } from './NextAnalysisBridge';
import { keepFocusAfterPanelAdd } from '../dock/focusTab';

export type NextAnalysisPointDrill = { level: string; value: string | null };

type Props = {
  output?: { panelId: string; key: string } | null;
  selection: AnalysisSelection | null;
  pointDrill?: NextAnalysisPointDrill;
};
/** `panelId`: the panel an `addsPanel` choice adds, when its `id` names a variant (a held copy, #2862). */
type Choice = { id: string; label: string; reason?: string; note?: string; panelId?: string; onSelect?: () => unknown };
type GroupAction = { label: string } & (
  | { reason: string; choices?: never }
  /** `addsPanel`: each choice adds the panel named by its `id` to the workspace around the row. */
  | { reason?: never; choices: Choice[]; direction?: 'right'; addsPanel?: boolean }
);

export type DirectNextAnalysisAction = {
  id: string;
  label: string;
  reason?: string;
  onSelect: (returnFocus?: () => boolean) => void;
  claimsFocus?: boolean;
};
export type NextAnalysisAction = GroupAction | DirectNextAnalysisAction;
const selectionDropMessage = {
  noInbound: 'chartNextSelectionNoInbound',
  ambiguous: 'chartNextSelectionAmbiguous',
  scope: 'chartNextSelectionScope',
  length: 'chartNextSelectionLength',
} as const;

export function useNextAnalysisItems({ output, selection, pointDrill, workspace }: Props & { workspace: AnalysisPanelDestinations | null }): GroupAction[] {
  const platform = usePlatform();
  const { depth, levels, enter, invalid } = useDrill();
  const { tx, t } = useI18n();
  const m = useMessages(COMPONENTS_MESSAGES);
  const menu = platform.route?.menu;
  if (!menu || !platform.canOpen(menu.id)) return [];

  const panels = platform.registry.panels(menu.id);
  const channel = panels.find(panel => panel.id === output?.panelId)?.outputs.find(item => item.key === output?.key)?.selection;
  const value = selection?.shape === 'set' && selection.values.length === 1 ? selection.values[0]! : null;
  const singleRequired = m('chartNextSingle');
  const actions: GroupAction[] = [];
  const next = invalid ? undefined : levels[depth];
  if (next && (pointDrill?.level ?? channel?.drillLevel) === next.key) {
    const drillValue = pointDrill ? pointDrill.value : value;
    const label = m('chartNextDrill');
    actions.push(drillValue ? {
      label, choices: [{ id: next.key, label: `${tx(next.label)} · ${drillValue}`, onSelect: () => enter(next.key, drillValue) }],
    } : { label, reason: singleRequired });
  }

  if (workspace && output && channel && selection) {
    const { key } = output;
    const choices = workspace.items.flatMap(item => {
      const panel = panels.find(panel => panel.id === item.id);
      if (!panel || ![...(panel.queryInputs.page ?? []), ...(panel.displayInputs.page ?? [])]
        .some(input => input.key === key && input.selection !== undefined)) return [];
      const reason = panel.permissions.every(permission => platform.can(permission))
        ? item.disabledReason && tx(item.disabledReason) : t('menuDenied');
      const source = `${menu.id}/${panel.id}` as const;
      const follow = { id: panel.id, label: tx(item.title), reason: reason || undefined, onSelect: () => workspace.onAdd({ source, inputs: { [key]: selection } }) };
      // A placed panel offers only its `again` mode, as a second instance (#2862 ②).
      const placed = item.placed ? item.again : undefined;
      if (!workspace.hold) return placed === 'hold' ? [] : [follow];
      // Follow keeps reading the URL; hold fixes the new panel to this selection (#2862).
      const hold = {
        id: `${panel.id}:hold`, panelId: panel.id, label: m('chartNextPanelHold', { panel: tx(item.title) }), reason: reason || undefined,
        note: m('chartNextPanelHoldNote'), onSelect: () => workspace.onAdd({ source, inputs: { [key]: selection }, mode: 'hold' }),
      };
      if (placed === 'hold') return [hold];
      if (placed === 'follow') return [{ ...follow, note: m('chartNextPanelFollowNote') }];
      return [{ ...follow, note: m('chartNextPanelFollowNote') }, hold];
    });
    if (choices.length) actions.push({ label: m('chartNextPanel'), choices, addsPanel: true });
  }

  if (output && channel?.objectKind) {
    const label = m('chartNextObject');
    if (!value) actions.push({ label, reason: singleRequired });
    else {
      const dimensionLabels = new Map<string, string>();
      for (const { key, selection } of panels.flatMap(panel => panel.outputs)) {
        if (!selection || dimensionLabels.has(selection.dimension)) continue;
        const label = selection.label ?? menu.analysisSelectionInbound?.find(inbound => inbound.key === key)?.label;
        if (label) dimensionLabels.set(selection.dimension, tx(label));
      }
      const choices = platform.objectSelectionLinks({ kind: channel.objectKind, id: value }, { returnTo: true, objectOutput: output.key })
        .map(link => {
          const destination = tx(link.label);
          const dropped = link.droppedPageKeys.length ? m('chartNextDropped', { keys: link.droppedPageKeys.join(', ') }) : '';
          const selectionNotes = link.droppedSelections?.map(({ dimension, reason }) =>
            m(selectionDropMessage[reason], { dimension: dimensionLabels.get(dimension) ?? dimension })) ?? [];
          const notes = [...new Set(selectionNotes)];
          if (link.kind === 'tooLong') return { id: link.menuId, label: destination, reason: m('chartNextTooLong'), note: notes.join(' · ') };
          const missing = link.missingRequired?.length ? m('chartNextMissing', {
            destination, keys: link.missingRequired.map(item => tx(item.label)).join(', '),
          }) : '';
          const carried = link.allowed && !dropped ? m('chartNextCarriesObject', { value }) : '';
          const note = [carried, dropped, missing, ...notes].filter(Boolean).join(' · ');
          return { id: link.menuId, label: destination, reason: link.allowed ? undefined : t('menuDenied'), note,
            onSelect: () => platform.navigate(link.href, { focus: 'page', carryProof: link.proof }) };
        });
      if (choices.length) actions.push({ label, choices, direction: 'right' });
    }
  }
  return actions;
}

function MenuItem({ label, reason, note, onSelect }: Omit<Choice, 'id' | 'onSelect'> & { onSelect?: () => void }) {
  const id = useId();
  const description = [reason, note].filter(Boolean).join(' · ');
  return <DropdownMenuItem aria-label={label} aria-disabled={reason ? true : undefined}
    aria-describedby={description ? id : undefined} onSelect={event => {
      if (reason) event.preventDefault();
      else onSelect?.();
    }}>
    <span className="flex min-w-0 flex-col">
      <span>{label}</span>
      {description && <span id={id} className="text-xs text-text-muted">{description}</span>}
    </span>
  </DropdownMenuItem>;
}

function ChoiceRows({ choices }: { choices: readonly Choice[] }) {
  return <>{choices.map(choice => <MenuItem key={choice.id} {...choice} />)}</>;
}

/** `focusKey`: the chart and its output, stable when the row is rebuilt, so a panel addition can find its trigger again. */
function ActionMenu({ action, focusKey }: { action: GroupAction; focusKey?: string }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  if (action.reason !== undefined) return <>
    <Button type="button" size="toolbar" variant="ghost" aria-disabled="true" aria-describedby={id}
      className="aria-disabled:opacity-50">{action.label}</Button>
    <span id={id} className="text-text-secondary">{action.reason}</span>
  </>;
  const Icon = action.direction === 'right' ? ChevronRight : ChevronDown;
  const choices = action.addsPanel
    // The addition can rebuild this row before the menu closes, so the focus hand-off starts on select, not on close.
    ? action.choices.map(choice => ({ ...choice, onSelect: () => {
      // The menu may name the slot it opened (a second instance, #2862 ②); the row rebuilds only after this handler.
      const opened = choice.onSelect?.();
      if (trigger.current) keepFocusAfterPanelAdd(trigger.current, typeof opened === 'string' ? opened : choice.panelId ?? choice.id);
    } }))
    : action.choices;
  return <DropdownMenu modal={false}>
    <DropdownMenuTrigger asChild>
      <Button ref={trigger} data-focus-key={action.addsPanel ? focusKey : undefined} type="button" size="toolbar" variant="ghost">{action.label}<Icon className="size-3.5" aria-hidden /></Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start"><ChoiceRows choices={choices} /></DropdownMenuContent>
  </DropdownMenu>;
}

export function NextAnalysisActionButton({ action, buttonRef, announceReason, quiet }: {
  action: DirectNextAnalysisAction; buttonRef?: Ref<HTMLButtonElement>; announceReason?: boolean;
  /** A view-only action drawn like the row's menu items, leaving the filled style to actions that change conditions. */
  quiet?: boolean;
}) {
  const id = useId();
  return <>
    <Button type="button" ref={buttonRef} size="toolbar" variant={quiet ? 'ghost' : undefined} disabled={!!action.reason} aria-describedby={action.reason ? id : undefined}
      onClick={() => action.onSelect()}>{action.label}</Button>
    {action.reason && <span id={id} role={announceReason ? 'status' : undefined} className="text-text-secondary">{action.reason}</span>}
  </>;
}

export function NextAnalysisMenuItem({ action, onSelect }: {
  action: NextAnalysisAction; onSelect: (action: DirectNextAnalysisAction) => void;
}) {
  if ('onSelect' in action) return <MenuItem label={action.label} reason={action.reason} onSelect={() => onSelect(action)} />;
  if (action.reason !== undefined) return <MenuItem label={action.label} reason={action.reason} />;
  return <DropdownMenuSub>
    <DropdownMenuSubTrigger>{action.label}</DropdownMenuSubTrigger>
    <DropdownMenuPortal><DropdownMenuSubContent><ChoiceRows choices={action.choices} /></DropdownMenuSubContent></DropdownMenuPortal>
  </DropdownMenuSub>;
}

type RowProps = Props & {
  localActions: readonly DirectNextAnalysisAction[]; renderRow: (items: ReactNode) => ReactNode;
  /** The chart drawing the row; with the output it tells apart two charts on the same output when a panel addition finds its trigger again. */
  chartId?: string;
};

function RoutedItems({ localActions, renderRow, chartId, ...props }: RowProps) {
  const workspace = useContext(AnalysisPanelAddContext);
  const actions = useNextAnalysisItems({ ...props, workspace });
  usePublishNextAnalysis(props.output, localActions, props.pointDrill);
  const focusKey = props.output && JSON.stringify(['next-analysis-panel', chartId ?? null, props.output.panelId, props.output.key]);
  return renderRow(actions.map(action => <ActionMenu key={action.label} action={action} focusKey={focusKey ?? undefined} />));
}

export function NextAnalysisItems(props: RowProps) {
  const platform = usePlatformOptional();
  return platform && (props.output || props.pointDrill) ? <RoutedItems {...props} /> : props.renderRow(null);
}
