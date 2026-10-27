import type { ReactNode } from 'react';
import { useI18n } from '@ap/kernel';
import { PaneScreenProvider, useHostPlatform, type PaneScreen } from '@ap/kernel/host';
import { GlobalContextBar } from '../context/GlobalContextBar';
import { ScopeSelector } from '../context/ScopeSelector';
import { canMountPaneScreen } from './boardMenus';
import { PaneBadge } from './PaneBadge';
import { boardText } from './text';

/**
 * The 48px Context bar row (docs/16 §4, §8): it edits the selected pane and is the only Scope selector on the board (06 §7). It reads
 * the pane through a second, controlled `PaneScreenProvider` with the pane's own id and screen (usage counted once, by the pane itself).
 * With no pane screen to edit the row stays, disabled, so the grid does not jump.
 */
export function BoardContextBar({ paneId, number, screen, onChange, onLeave }: {
  paneId: string; number: number; screen: PaneScreen | null; onChange: (next: PaneScreen, how: 'push' | 'replace') => void; onLeave: (href: string) => void;
}) {
  const { registry, canOpen } = useHostPlatform();
  const { lang } = useI18n();
  const text = boardText(lang);
  const badge = <PaneBadge label={text.pane(number)} selected />;
  const disabled = <div role="region" aria-label={text.paneContext(number)} aria-disabled="true" data-context-bar-disabled
    className="flex h-12 min-w-0 flex-1 items-center border-b border-border-subtle bg-surface-canvas px-3 text-xs text-text-muted">{text.emptyBarNote}</div>;
  const row = (middle: React.ReactNode, bar: React.ReactNode) => <div data-board-context-row className="flex h-12 shrink-0 items-stretch bg-surface-canvas">
    <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle pl-3">{badge}{middle}</div>
    <div className="flex min-w-0 flex-1">{bar}</div>
  </div>;
  // Only a pane that mounts its menu screen gets the Context controls; a denied one would otherwise read Scope and equipment data its body refuses.
  if (screen === null || !canMountPaneScreen(registry, canOpen, screen)) return row(null, disabled);
  return <PaneScreenProvider paneId={paneId} screen={screen} countUsage={false} onChange={onChange} onLeave={onLeave}>
    <ContractGate
      closed={row(null, disabled)}
      open={row(<ScopeSelector layout="bar" />, <div className="min-w-0 flex-1"><GlobalContextBar label={{ visible: text.contextLabel, region: text.paneContext(number) }} whenEmpty={disabled} /></div>)} />
  </PaneScreenProvider>;
}

/** A pane whose address is a contract error shows no editor either: its body shows the error and Reset. Reads the pane's own state. */
function ContractGate({ open, closed }: { open: ReactNode; closed: ReactNode }) {
  return <>{useHostPlatform().contractError ? closed : open}</>;
}
