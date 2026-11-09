import { useId, useRef } from 'react';
import { MoreHorizontal, TriangleAlert } from 'lucide-react';
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@ap/ui';
import { useI18n } from '@ap/kernel';
import type { WorkspaceCommand } from '../dock/WorkspaceCommandsHost';
import { SegmentedRadio } from '../RadioGroup';
import { workspaceText } from './text';

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
export function WorkspaceToolbar({ commands, onShown }: { commands: readonly WorkspaceCommand[]; /** A hidden panel was shown from the list: focus goes to its tab once the menu has closed. */ onShown: (panelId: string) => void }) {
  const { tx } = useI18n();
  const presets = commands.filter(command => command.kind === 'radio' && command.group !== 'mode');
  const modes = commands.filter(command => command.kind === 'radio' && command.group === 'mode');
  const hidden = commands.filter(command => command.id.startsWith(SHOW_PREFIX));
  const reset = commands.find(command => command.id === RESET_ID);
  const afterClose = useRef<(() => void) | null>(null);
  const current = presets.find(command => command.checked)?.id ?? null;
  // Presets cannot be changed while the compact arrangement shows (it is the preset): they are off, with the reason on the control.
  const compactOff = presets.length > 0 && presets.every(command => command.disabled);
  const reason = tx(workspaceText.compactPresetOff);
  const reasonId = useId();
  // The height mode follows the same rule: while the narrow display shows, it is off and says why.
  const modeOff = modes.length > 0 && modes.every(command => command.disabled);
  const modeReason = tx(workspaceText.modeOff);
  const modeReasonId = useId();
  // A hidden panel with a warning badge: the button shows the mark and says so in its description (its name stays `숨긴 패널 n`).
  const warned = hidden.filter(command => command.warning);
  const warnedId = useId();
  return <div role="toolbar" aria-label={tx(workspaceText.layout)} data-workspace-toolbar className="flex flex-wrap items-center gap-2">
    {presets.length > 1 && <span className="inline-flex" title={compactOff ? reason : undefined}>
      <SegmentedRadio label={tx(workspaceText.layout)} value={current} disabled={compactOff} describedBy={compactOff ? reasonId : undefined} onChange={next => { presets.find(command => command.id === next)?.run(); }}
        options={presets.map(command => ({ value: command.id, label: command.label }))} />
      {compactOff && <span id={reasonId} className="sr-only">{reason}</span>}
    </span>}
    <DropdownMenu>
      {warned.length > 0 && <span id={warnedId} className="sr-only">{warned.map(command => command.description ?? command.label).join(' · ')}</span>}
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="secondary" size="toolbar" disabled={hidden.length === 0} aria-describedby={warned.length > 0 ? warnedId : undefined}>
          {tx(workspaceText.hiddenPanels(hidden.length))}
          {warned.length > 0 && <TriangleAlert className="size-3.5 text-text-warning-label" aria-hidden data-hidden-warning />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" aria-label={tx(workspaceText.hiddenPanelsList)} onCloseAutoFocus={event => {
        const next = afterClose.current;
        afterClose.current = null;
        if (next === null) return;
        event.preventDefault();
        next();
      }}>
        {hidden.map(command => <DropdownMenuItem key={command.id} onSelect={() => { afterClose.current = () => { onShown(command.id.slice(SHOW_PREFIX.length)); }; command.run(); }}><HiddenItemLabel command={command} /></DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
    {reset && <Button type="button" variant="ghost" size="toolbar" disabled={reset.disabled} onClick={reset.run}>{reset.label}</Button>}
    {modes.length > 1 && <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" className="ml-auto size-7" data-workspace-height-mode aria-label={tx(workspaceText.heightMode)} title={tx(workspaceText.heightMode)}><MoreHorizontal className="size-3.5" aria-hidden /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{tx(workspaceText.heightMode)}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={modes.find(command => command.checked)?.id ?? ''} aria-describedby={modeOff ? modeReasonId : undefined} onValueChange={next => { modes.find(command => command.id === next)?.run(); }}>
          {modes.map(command => <DropdownMenuRadioItem key={command.id} value={command.id} disabled={command.disabled}>{command.label}</DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
        {modeOff && <p id={modeReasonId} className="px-2 py-1.5 text-xs text-text-secondary">{modeReason}</p>}
      </DropdownMenuContent>
    </DropdownMenu>}
  </div>;
}
