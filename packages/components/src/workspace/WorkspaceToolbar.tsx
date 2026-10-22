import { useRef } from 'react';
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@ap/ui';
import { useI18n } from '@ap/kernel';
import type { WorkspaceCommand } from '../dock/WorkspaceCommandsHost';
import { SegmentedRadio } from '../RadioGroup';
import { workspaceText } from './text';

export const SHOW_PREFIX = 'show:';
export const PRESET_PREFIX = 'preset:';
export const RESET_ID = 'reset';

/**
 * The workspace's one toolbar row: the presets, the hidden panels to reopen, `기본 배치`. It draws the same commands a host would
 * (`WorkspaceCommandsHost`), so the two surfaces cannot differ.
 */
export function WorkspaceToolbar({ commands, onShown }: { commands: readonly WorkspaceCommand[]; /** A hidden panel was shown from the list: focus goes to its tab once the menu has closed. */ onShown: (panelId: string) => void }) {
  const { tx } = useI18n();
  const presets = commands.filter(command => command.kind === 'radio');
  const hidden = commands.filter(command => command.id.startsWith(SHOW_PREFIX));
  const reset = commands.find(command => command.id === RESET_ID);
  const afterClose = useRef<(() => void) | null>(null);
  const current = presets.find(command => command.checked)?.id ?? null;
  // Presets cannot be changed while the compact arrangement shows (it is the preset): they are off, with the reason on the control.
  const compactOff = presets.length > 0 && presets.every(command => command.disabled);
  const reason = tx(workspaceText.compactPresetOff);
  return <div role="toolbar" aria-label={tx(workspaceText.layout)} data-workspace-toolbar className="flex flex-wrap items-center gap-2">
    {presets.length > 1 && <span className="inline-flex" title={compactOff ? reason : undefined}>
      <SegmentedRadio label={tx(workspaceText.layout)} value={current} disabled={compactOff} describedBy={compactOff ? 'workspace-compact-off' : undefined} onChange={next => { presets.find(command => command.id === next)?.run(); }}
        options={presets.map(command => ({ value: command.id, label: command.label }))} />
      {compactOff && <span id="workspace-compact-off" className="sr-only">{reason}</span>}
    </span>}
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="secondary" size="toolbar" disabled={hidden.length === 0}>{tx(workspaceText.hiddenPanels(hidden.length))}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" aria-label={tx(workspaceText.hiddenPanelsList)} onCloseAutoFocus={event => {
        const next = afterClose.current;
        afterClose.current = null;
        if (next === null) return;
        event.preventDefault();
        next();
      }}>
        {hidden.map(command => <DropdownMenuItem key={command.id} onSelect={() => { afterClose.current = () => { onShown(command.id.slice(SHOW_PREFIX.length)); }; command.run(); }}>{command.label}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
    {reset && <Button type="button" variant="ghost" size="toolbar" disabled={reset.disabled} onClick={reset.run}>{reset.label}</Button>}
  </div>;
}
