import { PaneScreenProvider, useI18n, usePlatform, type PaneScreen } from '@ap/kernel';
import { GlobalContextBar } from '../GlobalContextBar';
import { ScopeSelector } from '../ScopeSelector';
import { admitPaneScreen } from './boardMenus';
import { PaneBadge } from './PaneBadge';
import { boardText } from './text';

/**
 * The 48px Context bar row (docs/16 §4, §8): it edits the selected pane and is the only Scope selector on the board (06 §7). It reads
 * the pane through a second, controlled `PaneScreenProvider` with the pane's own id and screen (usage counted once, by the pane itself).
 * With no pane screen to edit the row stays, disabled, so the grid does not jump.
 */
export function BoardContextBar({ paneId, number, screen, onChange, onLeave }: {
  paneId: string; number: number; screen: PaneScreen | null; onChange: (next: PaneScreen) => void; onLeave: (href: string) => void;
}) {
  const { registry } = usePlatform();
  const { lang } = useI18n();
  const text = boardText(lang);
  const badge = <PaneBadge label={text.pane(number)} selected />;
  const disabled = <div role="region" aria-label={text.paneContext(number)} aria-disabled="true" data-context-bar-disabled
    className="flex h-12 min-w-0 flex-1 items-center border-b border-border-subtle bg-surface-canvas px-3 text-xs text-text-muted">{text.emptyBarNote}</div>;
  const row = (middle: React.ReactNode, bar: React.ReactNode) => <div data-board-context-row className="flex h-12 shrink-0 items-stretch bg-surface-canvas">
    <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle pl-3">{badge}{middle}</div>
    <div className="flex min-w-0 flex-1">{bar}</div>
  </div>;
  if (screen === null || !admitPaneScreen(registry, screen)) return row(null, disabled);
  return <PaneScreenProvider paneId={paneId} screen={screen} countUsage={false} onChange={next => onChange(next)} onLeave={onLeave}>
    {row(<ScopeSelector layout="bar" />, <div className="min-w-0 flex-1"><GlobalContextBar label={{ visible: text.contextLabel, region: text.paneContext(number) }} whenEmpty={disabled} /></div>)}
  </PaneScreenProvider>;
}
