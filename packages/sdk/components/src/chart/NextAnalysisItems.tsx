import { useContext, useId, type ReactNode, type Ref } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { AnalysisSelection } from '@ap/contracts';
import { useDrill, useI18n, useMessages, usePlatform, usePlatformOptional } from '@ap/kernel';
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@ap/ui';
import { COMPONENTS_MESSAGES } from '../messages';
import { AnalysisPanelAddContext, type AnalysisPanelAddition } from '../workspace/PanelAdd';
import { usePublishNextAnalysis } from './NextAnalysisBridge';

export type NextAnalysisPointDrill = { level: string; value: string | null };

type Props = {
  output?: { panelId: string; key: string } | null;
  selection: AnalysisSelection | null;
  pointDrill?: NextAnalysisPointDrill;
};
type Choice = { id: string; label: string; reason?: string; note?: string; onSelect: () => void };
type GroupAction = { label: string } & (
  | { reason: string; choices?: never }
  | { reason?: never; choices: Choice[]; direction?: 'right' }
);

export type DirectNextAnalysisAction = {
  id: string;
  label: string;
  reason?: string;
  onSelect: (returnFocus?: () => boolean) => void;
  claimsFocus?: boolean;
};
export type NextAnalysisAction = GroupAction | DirectNextAnalysisAction;

export function useNextAnalysisItems({ output, selection, pointDrill, workspace }: Props & { workspace: AnalysisPanelAddition | null }): GroupAction[] {
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
      return [{ id: panel.id, label: tx(item.title), reason: reason || undefined, onSelect: () => {
        workspace.onAdd({ source: `${menu.id}/${panel.id}`, inputs: { [key]: selection } });
      } }];
    });
    if (choices.length) actions.push({ label: m('chartNextPanel'), choices });
  }

  if (channel?.objectKind) {
    const label = m('chartNextObject');
    if (!value) actions.push({ label, reason: singleRequired });
    else {
      const choices = platform.objectLinks({ kind: channel.objectKind, id: value }, { returnTo: true })
        .filter(link => link.kind === 'link').map(link => {
          const destination = tx(link.label);
          const dropped = link.droppedPageKeys.length ? m('chartNextDropped', { keys: link.droppedPageKeys.join(', ') }) : '';
          const missing = link.missingRequired?.length ? m('chartNextMissing', {
            destination, keys: link.missingRequired.map(item => tx(item.label)).join(', '),
          }) : '';
          const carried = link.allowed && !dropped ? m('chartNextCarriesObject', { value }) : '';
          const note = [carried, dropped, missing].filter(Boolean).join(' · ');
          return { id: link.menuId, label: destination, reason: link.allowed ? undefined : t('menuDenied'), note,
            onSelect: () => platform.navigate(link.href, { focus: 'page' }) };
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

function ActionMenu({ action }: { action: GroupAction }) {
  const id = useId();
  if (action.reason !== undefined) return <>
    <Button type="button" size="toolbar" variant="ghost" aria-disabled="true" aria-describedby={id}
      className="aria-disabled:opacity-50">{action.label}</Button>
    <span id={id} className="text-text-secondary">{action.reason}</span>
  </>;
  const Icon = action.direction === 'right' ? ChevronRight : ChevronDown;
  return <DropdownMenu modal={false}>
    <DropdownMenuTrigger asChild>
      <Button type="button" size="toolbar" variant="ghost">{action.label}<Icon className="size-3.5" aria-hidden /></Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start"><ChoiceRows choices={action.choices} /></DropdownMenuContent>
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

type RowProps = Props & { localActions: readonly DirectNextAnalysisAction[]; renderRow: (items: ReactNode) => ReactNode };

function RoutedItems({ localActions, renderRow, ...props }: RowProps) {
  const workspace = useContext(AnalysisPanelAddContext);
  const actions = useNextAnalysisItems({ ...props, workspace });
  usePublishNextAnalysis(props.output, localActions, props.pointDrill);
  return renderRow(actions.map(action => <ActionMenu key={action.label} action={action} />));
}

export function NextAnalysisItems(props: RowProps) {
  const platform = usePlatformOptional();
  return platform && (props.output || props.pointDrill) ? <RoutedItems {...props} /> : props.renderRow(null);
}
