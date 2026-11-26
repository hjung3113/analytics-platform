import { createPortal } from 'react-dom';
import { isValidElement, useContext, useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { ChevronDown, MoreHorizontal, PanelTopOpen, TriangleAlert } from 'lucide-react';
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger, cn } from '@ap/ui';
import { useMessages } from '@ap/kernel';
import type { WorkspaceCommand } from '../dock/WorkspaceCommandsHost';
import { SegmentedRadio } from '../RadioGroup';
import { WorkspaceQueryBarContext } from '../archetypes/WorkspaceQueryBar';
import { PanelAddMenu } from './PanelAdd';
import { useInWorkspacePanel } from './panelContext';
import { COMPONENTS_MESSAGES } from '../messages';

const CONTEXT_LINE_MESSAGES = {
  hidden: { ko: '숨김 {count}', en: 'Hidden {count}' },
};

export const SHOW_PREFIX = 'show:';
export const PRESET_PREFIX = 'preset:';
export const MODE_PREFIX = 'mode:';
export const RESET_ID = 'reset';

/** A `다시 보기` item: the label, and under it the badge description of the hidden panel when it has one. */
function HiddenItemLabel({ command }: { command: WorkspaceCommand }) {
  if (!command.description) return command.label;
  return <span className="grid">{command.label}<span className="text-tiny text-text-muted">{command.description}</span></span>;
}

/**
 * The workspace's one toolbar row: the presets, the hidden panels to reopen, `기본 배치` and, at the end, `⋯` with the height mode. It draws the same commands a host would
 * (`WorkspaceCommandsHost`), so the two surfaces cannot differ.
 */
export function WorkspaceToolbar({ commands, onShown, label, actions }: { label: string; commands: readonly WorkspaceCommand[]; /** A hidden panel was shown from the list: focus goes to its tab once the menu has closed. */ onShown: (panelId: string) => void; /** The menu's actions (#2416), right-aligned before the height-mode `⋯`. */ actions?: ReactNode }) {
  const m = useMessages(COMPONENTS_MESSAGES);
  const workspace = useContext(WorkspaceQueryBarContext);
  const inPanel = useInWorkspacePanel();
  const registerToolbar = workspace?.line?.registerToolbar;
  useLayoutEffect(() => {
    if (!inPanel) return registerToolbar?.();
  }, [inPanel, registerToolbar]);
  const text = useMessages(CONTEXT_LINE_MESSAGES);
  const presets = commands.filter(command => command.kind === 'radio' && command.group !== 'mode');
  const modes = commands.filter(command => command.kind === 'radio' && command.group === 'mode');
  const hidden = commands.filter(command => command.id.startsWith(SHOW_PREFIX));
  // Minimized panels (#2359): a chip each, named like its `다시 보기` item so the visible text stays in the name.
  const chips = hidden.filter(command => command.chip);
  const reset = commands.find(command => command.id === RESET_ID);
  const afterClose = useRef<(() => void) | null>(null);
  const current = presets.find(command => command.checked)?.id ?? null;
  // Presets cannot be changed while the compact arrangement shows (it is the preset): they are off, with the reason on the control.
  const compactOff = presets.length > 0 && presets.every(command => command.disabled);
  const reason = m('workspaceCompactPresetOff');
  const reasonId = useId();
  // The height mode follows the same rule: while the narrow display shows, it is off and says why.
  const modeOff = modes.length > 0 && modes.every(command => command.disabled);
  const modeReason = m('workspaceModeOff');
  const modeReasonId = useId();
  // A hidden panel with a warning badge: the button shows the mark and says so in its description (its name stays `숨긴 패널 n`).
  const warned = hidden.filter(command => command.warning);
  const warnedId = useId();
  const contextLineTarget = !inPanel && workspace?.line?.active ? workspace.toolbarTarget : null;
  const inContextLine = contextLineTarget !== null;
  const layoutName = m('workspaceLayout');
  const hiddenLabel = m('workspaceHiddenPanels', { count: hidden.length });
  const addTooltip = isValidElement(actions) && actions.type === PanelAddMenu ? m('panelAdd') : undefined;
  const modeItems = <>
    <DropdownMenuLabel>{m('workspaceHeightMode')}</DropdownMenuLabel>
    <DropdownMenuRadioGroup value={modes.find(command => command.checked)?.id ?? ''} aria-describedby={modeOff ? modeReasonId : undefined} onValueChange={next => { modes.find(command => command.id === next)?.run(); }}>
      {modes.map(command => <DropdownMenuRadioItem key={command.id} value={command.id} disabled={command.disabled}>{command.label}</DropdownMenuRadioItem>)}
    </DropdownMenuRadioGroup>
    {modeOff && <p id={modeReasonId} className="px-2 py-1.5 text-xs text-text-secondary">{modeReason}</p>}
  </>;
  const toolbar = <div role="toolbar" aria-label={inContextLine ? label : layoutName} data-workspace-toolbar className={cn('flex items-center', inContextLine ? 'gap-1' : 'flex-wrap gap-2')}>
    {inContextLine && <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="secondary" size="toolbar" title={layoutName} aria-label={layoutName}>
          {presets.find(command => command.checked)?.label ?? layoutName}<ChevronDown className="size-3.5" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" aria-label={layoutName}>
        {presets.length > 0 && <>
          <DropdownMenuLabel>{layoutName}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={current ?? ''} aria-describedby={compactOff ? reasonId : undefined}
            onValueChange={next => { presets.find(command => command.id === next)?.run(); }}>
            {presets.map(command => <DropdownMenuRadioItem key={command.id} value={command.id} disabled={command.disabled}>{command.label}</DropdownMenuRadioItem>)}
          </DropdownMenuRadioGroup>
          {compactOff && <p id={reasonId} className="px-2 py-1.5 text-xs text-text-secondary">{reason}</p>}
          <DropdownMenuSeparator />
        </>}
        {modes.length > 1 && modeItems}
        {reset && <DropdownMenuItem disabled={reset.disabled} onSelect={reset.run}>{reset.label}</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>}
    {!inContextLine && presets.length > 1 && <span className="inline-flex" title={compactOff ? reason : undefined}>
      <SegmentedRadio label={m('workspaceLayout')} value={current} disabled={compactOff} describedBy={compactOff ? reasonId : undefined} onChange={next => { presets.find(command => command.id === next)?.run(); }}
        options={presets.map(command => ({ value: command.id, label: command.label }))} />
      {compactOff && <span id={reasonId} className="sr-only">{reason}</span>}
    </span>}
    {inContextLine && actions !== undefined && <div data-workspace-actions className="flex items-center gap-1" title={addTooltip}>{actions}</div>}
    {(!inContextLine || hidden.length > 0) && <DropdownMenu modal={!inContextLine}>
      {warned.length > 0 && <span id={warnedId} className="sr-only">{warned.map(command => command.description ?? command.label).join(' · ')}</span>}
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="secondary" size="toolbar" disabled={hidden.length === 0} title={inContextLine ? hiddenLabel : undefined} aria-label={inContextLine ? hiddenLabel : undefined} aria-describedby={warned.length > 0 ? warnedId : undefined}>
          {inContextLine ? text('hidden', { count: hidden.length }) : hiddenLabel}
          {warned.length > 0 && <TriangleAlert className="size-3.5 text-text-warning-label" aria-hidden data-hidden-warning />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" aria-label={m('workspaceHiddenPanelsList')} onCloseAutoFocus={event => {
        const next = afterClose.current;
        afterClose.current = null;
        if (next === null) return;
        event.preventDefault();
        next();
      }}>
        {hidden.map(command => <DropdownMenuItem key={command.id} onSelect={() => { afterClose.current = () => { onShown(command.id.slice(SHOW_PREFIX.length)); }; command.run(); }}><HiddenItemLabel command={command} /></DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>}
    {!inContextLine && chips.map(command => <Button key={command.id} type="button" variant="secondary" size="toolbar" className="max-w-80" data-workspace-minimized={command.id.slice(SHOW_PREFIX.length)}
      aria-label={m('workspaceShowPanel', { title: command.chip! })} title={command.chip} onClick={() => { command.run(); onShown(command.id.slice(SHOW_PREFIX.length)); }}>
      <PanelTopOpen className="size-3.5 shrink-0" aria-hidden /><span className="truncate">{command.chip}</span>
    </Button>)}
    {!inContextLine && reset && <Button type="button" variant="ghost" size="toolbar" disabled={reset.disabled} onClick={reset.run}>{reset.label}</Button>}
    {!inContextLine && actions !== undefined && <div data-workspace-actions className="ml-auto flex items-center gap-2">{actions}</div>}
    {!inContextLine && modes.length > 1 && <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" className={cn(actions === undefined && 'ml-auto', 'size-7')} data-workspace-height-mode aria-label={m('workspaceHeightMode')} title={m('workspaceHeightMode')}><MoreHorizontal className="size-3.5" aria-hidden /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {modeItems}
      </DropdownMenuContent>
    </DropdownMenu>}
  </div>;
  return contextLineTarget ? createPortal(toolbar, contextLineTarget) : toolbar;
}
