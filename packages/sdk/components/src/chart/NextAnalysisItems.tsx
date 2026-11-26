import { useContext, useId, useRef, useState, type ReactNode, type Ref } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { AnalysisSelection } from '@ap/contracts';
import { useDrill, useI18n, useMessages, usePlatform, usePlatformOptional } from '@ap/kernel';
import { useAnalysisSelectionChannelName } from '@ap/kernel/host';
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger, Popover, PopoverTrigger } from '@ap/ui';
import { COMPONENTS_MESSAGES } from '../messages';
import { analysisSelectionLabel } from '../filters/analysisSelectionLabel';
import { AnalysisPanelAddContext, hasCategorizedPanels, type AnalysisPanelDestinations, type AnalysisPanelDraft, type PanelAddItem } from '../workspace/PanelAdd';
import { PanelListRows } from '../workspace/PanelListRows';
import { PanelPickerContent, type PanelPickerRow } from '../workspace/PanelPicker';
import { drillBasisChoices, useDrillBasisChoice } from './ChartDrillBasisMenu';
import { usePublishNextAnalysis } from './NextAnalysisBridge';
import { keepFocusAfterPanelAdd } from '../dock/focusTab';
import { capturePageFocusReturn } from '../state/pageFocus';

export type NextAnalysisPointDrill = { level: string; value: string | null };

type Props = {
  output?: { panelId: string; key: string } | null;
  selection: AnalysisSelection | null;
  pointDrill?: NextAnalysisPointDrill;
};
/** `panelId`: the panel an `addsPanel` choice adds, when its `id` names a variant (a held copy, #2862). */
type Choice = Pick<PanelPickerRow, 'category' | 'kind'> & {
  id: string; label: string; reason?: string; note?: string; panelId?: string; onSelect?: () => unknown;
  previewDescription?: string;
};
type SelectionPanelAction = { label: string; reason?: never; choices: Choice[]; addsPanel: true; inputLabel: string; direction?: never };
type GroupAction = { label: string } & (
  | { reason: string; choices?: never }
  /** `addsPanel`: each choice adds the panel named by its `id` to the workspace around the row. */
  | { reason?: never; choices: Choice[]; direction?: 'right'; addsPanel?: boolean }
  | SelectionPanelAction
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

function usePanelChoices() {
  const { tx } = useI18n();
  const m = useMessages(COMPONENTS_MESSAGES);
  return (workspace: AnalysisPanelDestinations, item: PanelAddItem & { placed: boolean }, draft: Omit<AnalysisPanelDraft, 'mode'>, reason?: string): Choice[] => {
    const add = (input: AnalysisPanelDraft): unknown => {
      const opened: unknown = workspace.onAdd(input);
      return workspace.returnsOpened && typeof opened === 'string' ? opened : undefined;
    };
    const title = tx(item.title);
    const preview = { category: item.category, kind: item.kind, previewDescription: item.description && tx(item.description) };
    const follow = { ...preview, id: item.id, label: title, reason, onSelect: () => add(draft) };
    const placed = item.placed ? item.again : undefined;
    if (!workspace.hold) return placed === 'hold' ? [] : [follow];
    const hold = {
      ...preview, id: `${item.id}:hold`, panelId: item.id, label: m('chartNextPanelHold', { panel: title }), reason,
      note: m('chartNextPanelHoldNote'), onSelect: () => add({ ...draft, mode: 'hold' }),
    };
    if (placed === 'hold') return [hold];
    if (placed === 'follow') return [{ ...follow, note: m('chartNextPanelFollowNote') }];
    return [{ ...follow, note: m('chartNextPanelFollowNote') }, hold];
  };
}

export function useNextAnalysisItems({ output, selection, pointDrill, workspace }: Props & {
  workspace: AnalysisPanelDestinations | null;
}): GroupAction[] {
  const platform = usePlatform();
  const channelName = useAnalysisSelectionChannelName(platform, workspace && selection ? output?.key : undefined);
  const { depth, levels, enter, invalid, trail } = useDrill();
  const basisMemory = useDrillBasisChoice(platform, trail);
  const { tx, t, lang } = useI18n();
  const m = useMessages(COMPONENTS_MESSAGES);
  const panelChoices = usePanelChoices();
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
    const defaultLabel = tx(next.label);
    const bases = drillValue ? drillBasisChoices(platform, next.key, drillValue, defaultLabel, lang) : undefined;
    actions.push(drillValue ? {
      label, choices: bases?.map(basis => ({
        ...basis, onSelect: () => {
          const picked = basis.id || undefined;
          basisMemory.remember(next.key, drillValue, picked);
          enter(next.key, drillValue, { basis: picked });
        },
      })) ?? [{ id: next.key, label: `${defaultLabel} · ${drillValue}`, onSelect: () => enter(next.key, drillValue) }],
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
      return panelChoices(workspace, item, { source, inputs: { [key]: selection } }, reason || undefined);
    });
    if (choices.length) {
      const action = { label: m('chartNextPanel'), choices, addsPanel: true } as const;
      const categorized = workspace.categorized ?? hasCategorizedPanels(workspace.items);
      if (categorized) {
        const dimension = channelName ?? channel.dimension;
        actions.push({ ...action, inputLabel: analysisSelectionLabel(selection, typeof dimension === 'string' ? dimension : tx(dimension), lang) });
      } else actions.push(action);
    }
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

function ChoiceRows({ choices }: { choices: readonly Choice[] }) {
  // An empty reason never disabled a «다음 분석» row; only a non-empty one does (the shared row disables on presence).
  return <PanelListRows rows={choices.map(choice => choice.reason ? choice : { ...choice, reason: undefined })} presentation="named-menu" />;
}

export function SelectionPanelPicker({ action, close, onCloseAutoFocus }: {
  action: SelectionPanelAction; close: () => void; onCloseAutoFocus?: (event: Event) => void;
}) {
  const m = useMessages(COMPONENTS_MESSAGES);
  const rows = action.choices.map(({ previewDescription, ...choice }) => ({
    ...choice, description: previewDescription, status: choice.reason === undefined ? undefined : m('panelAddUnavailable'),
    onSelect: () => { choice.onSelect?.(); },
  }));
  return <PanelPickerContent rows={rows} categorized label={action.label} inputLabel={action.inputLabel}
    close={close} onCloseAutoFocus={onCloseAutoFocus} />;
}

function addPanelFromChoice(choice: Choice, getTrigger: () => HTMLButtonElement | null, onUnavailable?: () => void): boolean {
  // The menu may name the slot it opened (a second instance, #2862 ②); the row rebuilds only after this handler.
  const opened = choice.onSelect?.();
  const trigger = getTrigger();
  if (!trigger) return false;
  keepFocusAfterPanelAdd(trigger, typeof opened === 'string' ? opened : choice.panelId ?? choice.id, onUnavailable);
  return true;
}

/** `focusKey`: the chart and its output, stable when the row is rebuilt, so a panel addition can find its trigger again. */
function ActionMenu({ action, focusKey }: { action: GroupAction; focusKey?: string }) {
  const platform = usePlatformOptional();
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const restorePickerFocus = useRef<(() => void) | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const setPickerOpen = (next: boolean) => {
    if (next && trigger.current) {
      const path = () => platform?.location.read()?.split('?')[0];
      const openingPath = path();
      const restore = capturePageFocusReturn(trigger.current);
      restorePickerFocus.current = () => { if (path() === openingPath) restore(); };
    }
    setOpen(next);
  };
  if (action.reason !== undefined) return <>
    <Button type="button" size="toolbar" variant="ghost" aria-disabled="true" aria-describedby={id}
      className="aria-disabled:opacity-50">{action.label}</Button>
    <span id={id} className="text-text-secondary">{action.reason}</span>
  </>;
  const Icon = action.direction === 'right' ? ChevronRight : ChevronDown;
  const choices = action.addsPanel
    // The addition can rebuild this row before the menu closes, so the focus hand-off starts on select, not on close.
    ? action.choices.map(choice => ({ ...choice, onSelect: () => addPanelFromChoice(choice, () => trigger.current) }))
    : action.choices;
  const button = <Button ref={trigger} data-focus-key={action.addsPanel ? focusKey : undefined} type="button" size="toolbar" variant="ghost">{action.label}<Icon className="size-3.5" aria-hidden /></Button>;
  if ('inputLabel' in action) return <Popover open={open} onOpenChange={setPickerOpen}>
    <PopoverTrigger asChild onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setPickerOpen(true); } }}>{button}</PopoverTrigger>
    <SelectionPanelPicker action={{ ...action, choices: action.choices.map(choice => ({ ...choice, onSelect: () => {
      // As in the flat menu, the tab watcher owns focus after an add; the page return is its fallback when no tab can take it.
      if (addPanelFromChoice(choice, () => trigger.current, restorePickerFocus.current)) restorePickerFocus.current = undefined;
    } })) }} close={() => setPickerOpen(false)} onCloseAutoFocus={event => {
      event.preventDefault();
      restorePickerFocus.current?.();
      restorePickerFocus.current = undefined;
    }} />
  </Popover>;
  return <DropdownMenu modal={false}>
    <DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>
    <DropdownMenuContent align="start"><ChoiceRows choices={choices} /></DropdownMenuContent>
  </DropdownMenu>;
}

/** A workspace can use the same choices and focus behavior with explicit inputs instead of a chart selection. */
export function ToolbarAnalysisPanelAdd({ workspace }: { workspace: AnalysisPanelDestinations }) {
  const { tx } = useI18n();
  const m = useMessages(COMPONENTS_MESSAGES);
  const panelChoices = usePanelChoices();
  const focusKey = useId();
  const choices = workspace.items.flatMap(item => {
    const draft = workspace.toolbarDraft?.(item);
    return draft ? panelChoices(workspace, item, draft, item.disabledReason && tx(item.disabledReason)) : [];
  });
  return choices.length ? <ActionMenu focusKey={focusKey} action={{ label: m('chartNextPanel'), choices, addsPanel: true }} /> : null;
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

export function NextAnalysisMenuItem({ action, onSelect, onOpenPicker }: {
  action: NextAnalysisAction; onSelect: (action: DirectNextAnalysisAction) => void; onOpenPicker: () => void;
}) {
  if ('onSelect' in action) return <ChoiceRows choices={[{ ...action, onSelect: () => onSelect(action) }]} />;
  if (action.reason !== undefined) return <ChoiceRows choices={[{ id: action.label, label: action.label, reason: action.reason }]} />;
  if ('inputLabel' in action) return <DropdownMenuItem aria-haspopup="dialog" onSelect={onOpenPicker}>{action.label}</DropdownMenuItem>;
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
