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
export function WorkspaceToolbar({ commands }: { commands: readonly WorkspaceCommand[] }) {
  const { tx } = useI18n();
  const presets = commands.filter(command => command.kind === 'radio');
  const hidden = commands.filter(command => command.id.startsWith(SHOW_PREFIX));
  const reset = commands.find(command => command.id === RESET_ID);
  const current = presets.find(command => command.checked)?.id ?? null;
  return <div role="toolbar" aria-label={tx(workspaceText.layout)} data-workspace-toolbar className="flex flex-wrap items-center gap-2">
    {presets.length > 1 && <SegmentedRadio label={tx(workspaceText.layout)} value={current} onChange={next => { presets.find(command => command.id === next)?.run(); }}
      options={presets.map(command => ({ value: command.id, label: command.label }))} />}
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="secondary" size="toolbar" disabled={hidden.length === 0}>{tx(workspaceText.hiddenPanels(hidden.length))}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" aria-label={tx(workspaceText.hiddenPanelsList)}>
        {hidden.map(command => <DropdownMenuItem key={command.id} onSelect={command.run}>{command.label}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
    {reset && <Button type="button" variant="ghost" size="toolbar" disabled={reset.disabled} onClick={reset.run}>{reset.label}</Button>}
  </div>;
}
