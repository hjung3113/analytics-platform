import { useCompactPageDensity } from '../pageDensity';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useI18n, usePlatform, type Text } from '@ap/kernel';
import { cn, isProductionEnv } from '@ap/ui';
import { activatePanel, groupOf, movePanel, panelOrder } from '../dock/commands';
import { focusTabSoon } from '../dock/focusTab';
import { DockLayoutBase } from '../dock/DockLayout';
import type { DockPanel, DockRows } from '../dock/dockTypes';
import { dockLayoutMenu } from '../dock/layoutMenu';
import { dockGroupsInReadingOrder } from '../dock/schema';
import { useRegisterWorkspaceCommands, useWorkspaceDepth, WorkspaceDepthProvider, type WorkspaceCommand } from '../dock/WorkspaceCommandsHost';
import { InWorkspacePanelProvider } from './panelContext';
import { PanelBadge } from './PanelBadge';
import { workspaceText } from './text';
import { MODE_PREFIX, PRESET_PREFIX, RESET_ID, SHOW_PREFIX, WorkspaceToolbar } from './WorkspaceToolbar';
import { WorkspaceGroupActions } from './WorkspaceGroupActions';
import { readWorkspaceState, sameWorkspaceState, workspaceStorageKey, writeWorkspaceState, WORKSPACE_WRITE_DELAY_MS } from './workspaceStorage';
import { applyPreset, hidePanel, initialWorkspaceState, presetTree, resetLayout, settleRows, showPanel, tabAfterHide, withRows, WORKSPACE_ID, type PanelWorkspaceLayout, type RowEnv, type WorkspaceSpec, type WorkspaceState } from './workspaceState';
import { canMoveBelow, clampRow, enterRows, moveToNewRow, NEW_ROW_HEIGHT, rowMinimumOf, topLevelRows } from './workspaceRows';
import { useRegisterPageFlow } from '../pageFlow';
import { useVisibleAreaHeight } from '../visibleArea';

export type { PanelWorkspaceLayout } from './workspaceState';

export type PanelWorkspacePanel = {
  /** Static identifier (`^[a-z][a-z0-9._-]{0,63}$`): it is stored in the local preference. */
  id: string;
  title: Text;
  render: () => ReactNode;
  /** Exactly one panel is primary (the first when none is): it can never be hidden and keeps the space other panels free. */
  primary?: boolean;
  /** px; default 240 × 160. */
  minWidth?: number;
  minHeight?: number;
  /**
   * Signals that the panel holds something while it is a background tab or hidden (`추세 · 2 rows added`, partial data). Drawn in the tab (count above 99
   * as `99+`; `warning` adds a triangle, never colour alone) and spoken as the tab's `aria-description`; the title and the tab's name never change.
   * A hidden panel's `warning` marks the `숨긴 패널 n` button, and its `다시 보기` item carries the `description`. Changing it does not remount panels
   * and is not announced through a live region.
   */
  badge?: { count?: number; tone?: 'neutral' | 'warning'; description: Text };
};

export type PanelWorkspacePreset = { id: string; label: Text; layout: PanelWorkspaceLayout };

export type PanelWorkspaceProps = {
  panels: readonly PanelWorkspacePanel[];
  presets: readonly PanelWorkspacePreset[];
  initialPreset: string;
  /** Preset shown below `compactBelow` (in memory only). Without it the panels stack into one tab group (display only). */
  compactPreset?: string;
  /** Static identifier of this workspace within its menu (`^[a-z][a-z0-9._-]{0,63}$`): part of the local preference key. */
  persistKey: string;
  /** Accessible name of the region. */
  label: Text;
  /** Container width in px under which the compact arrangement is shown. Default 900. */
  compactBelow?: number;
  /** Height mode of a workspace nobody has touched. A saved preference, a saved `화면 맞춤` included, always wins; `기본 배치` keeps the user's mode. Below `compactBelow` fit shows and the stored mode is untouched. Default `fit`. */
  initialMode?: 'fit' | 'stack';
  /**
   * Brings `panelId` to the front of its tab group when `seq` changes (a menu counts up: `{ panelId: 'trend', seq: n + 1 }`). Only the active tab
   * changes: a hidden panel stays hidden (hiding is the user's decision), another panel's maximize is kept (it is a no-op, not queued) and focus
   * never moves. An unknown `panelId`, a repeated `seq` and `null` do nothing. A request present on mount is not applied.
   */
  revealRequest?: { panelId: string; seq: number } | null;
};

const DEFAULT_COMPACT_BELOW = 900;
/** px: the visible height assumed until the first measure (and where nothing can be measured). */
const DEFAULT_VISIBLE = 900;
/** px: the toolbar row and its gap, for the baseline of a workspace that has not been shown fitted yet. */
const TOOLBAR_CHROME = 48;

/** Development-only diagnostics; production renders on with the repair rules of the state. */
function useDevChecks(props: PanelWorkspaceProps) {
  const { panels, presets, initialPreset, compactPreset, persistKey } = props;
  const signature = JSON.stringify([panels.map(panel => [panel.id, panel.primary === true]), presets.map(preset => preset.id), initialPreset, compactPreset, persistKey]);
  useEffect(() => {
    if (isProductionEnv(import.meta as { env?: { PROD?: boolean } }, globalThis as { process?: { env?: { NODE_ENV?: string } } })) return;
    const problems: string[] = [];
    if (panels.filter(panel => panel.primary).length !== 1) problems.push('exactly one panel must be primary (the first is used)');
    if (!WORKSPACE_ID.test(persistKey)) problems.push(`persistKey "${persistKey}" must match ${String(WORKSPACE_ID)}`);
    for (const panel of panels) if (!WORKSPACE_ID.test(panel.id)) problems.push(`panel id "${panel.id}" must match ${String(WORKSPACE_ID)}`);
    if (new Set(panels.map(panel => panel.id)).size !== panels.length) problems.push('panel ids must be unique');
    if (!presets.some(preset => preset.id === initialPreset)) problems.push(`initialPreset "${initialPreset}" is not a preset`);
    if (compactPreset !== undefined && !presets.some(preset => preset.id === compactPreset)) problems.push(`compactPreset "${compactPreset}" is not a preset`);
    if (problems.length > 0) console.error(`[PanelWorkspace] ${problems.join('; ')}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `signature` serialises exactly the inputs read above, so the check re-runs only when they change, not on every new array identity
  }, [signature]);
}

/**
 * **Decided** (ADR-0067 decision 22, met by #690: #755, #756): a menu's panels in a dock layout the user can rearrange. The menu declares the panels, a few
 * named arrangements (presets) and which panel is primary; the platform owns the tabs, drag, split, maximize, the hidden-panel list, the
 * default layout and the local preference. Use it for dense analysis menus with four or more panels (06 §12); everything else keeps
 * `AnalysisLayout`.
 *
 * - **Remount 0.** Switching preset, `기본 배치`, moving, splitting, tab choice and maximize re-arrange panels that stay mounted, so their
 *   state and queries are untouched. A hidden panel's subtree unmounts: state that must survive hiding lives above the workspace.
 * - **Toolbar or host.** Alone, a toolbar row sits above the panels. Inside a `WorkspaceCommandsHost` (the board pane) there is no
 *   toolbar and the same commands go to the host's menu.
 * - **Compact.** Under `compactBelow` the `compactPreset` arrangement shows, in memory only: what the user does there is not stored and
 *   the stored layout returns on widening. Without `compactPreset` the panels stack into one tab group.
 * - **Local preference.** `platform:workspace:v1:<user>:<menu>:<persistKey>` in `localStorage` (written 300 ms after a change, flushed on
 *   unmount and `pagehide`); read once on mount, never by a query. Without a user or a routed menu it stays in memory. Two panes showing
 *   the same menu and `persistKey` share it; the last writer wins. Maximize is never stored.
 * - **Fill.** Give the page `layout="fill"` so the workspace takes the height under the header.
 * - **Height mode.** `화면 맞춤` (default): the workspace fills the remaining height and the panels share it. `아래로 쌓기`: the top-level rows keep
 *   their own px heights, the workspace is as tall as they are (plus a strip that takes a tab for a new row) and the page scrolls. The user
 *   chooses per workspace in the toolbar or the host menu; it is stored with the layout. Below `compactBelow` it is off (fit shows) and comes
 *   back on widening.
 */
export function PanelWorkspace(props: PanelWorkspaceProps) {
  const { session, route } = usePlatform();
  useDevChecks(props);
  if (props.panels.length === 0) return null;
  const userId = session.user.id;
  const menuId = route?.menu.id;
  const storageKey = userId && menuId ? workspaceStorageKey(userId, menuId, props.persistKey) : null;
  // A persistKey (or menu, or user) change is a different workspace: its body remounts and restores that key's state on its own.
  return <WorkspaceBody key={storageKey ?? `memory:${props.persistKey}`} {...props} storageKey={storageKey} />;
}

function WorkspaceBody({ panels, presets: given, initialPreset, compactPreset, label, compactBelow = DEFAULT_COMPACT_BELOW, initialMode, revealRequest, storageKey }: PanelWorkspaceProps & { storageKey: string | null }) {
  const densePage = useCompactPageDensity();
  const { tx } = useI18n();
  const depth = useWorkspaceDepth() + 1;
  const primaryId = (panels.find(panel => panel.primary) ?? panels[0]!).id;
  const presets: readonly PanelWorkspacePreset[] = given.length > 0 ? given : [{ id: initialPreset, label: workspaceText.layout, layout: { type: 'group', panels: panels.map(panel => panel.id) } }];
  const rowMinimum = rowMinimumOf(new Map(panels.map(panel => [panel.id, { minWidth: panel.minWidth, minHeight: panel.minHeight }])));
  const spec: WorkspaceSpec = { panelIds: panels.map(panel => panel.id), primaryId, presets, initialPreset, rowMinimum, initialMode };
  const titleOf = (id: string) => { const panel = panels.find(candidate => candidate.id === id); return panel ? tx(panel.title) : id; };
  /** The panel's badge with its description localised. */
  const badgeOf = (id: string) => { const badge = panels.find(candidate => candidate.id === id)?.badge; return badge ? { count: badge.count, tone: badge.tone ?? 'neutral', description: tx(badge.description) } : undefined; };

  const [stored, setStored] = useState<WorkspaceState>(() => (storageKey ? readWorkspaceState(storageKey, spec) : null) ?? initialWorkspaceState(spec));

  // Width of the workspace: under `compactBelow` with a compact preset the arrangement is the preset's, in memory.
  const root = useRef<HTMLDivElement>(null);
  // Only the side of `compactBelow` is state: a resize that stays on one side re-renders nothing (#823).
  const [narrow, setNarrow] = useState(false);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => { const entry = entries[entries.length - 1]; if (entry) setNarrow(entry.contentRect.width < compactBelow); });
    observer.observe(element);
    return () => { observer.disconnect(); };
  }, [compactBelow]);
  const compactSpec = compactPreset === undefined ? undefined : presets.find(preset => preset.id === compactPreset);
  const compact = compactSpec !== undefined && narrow;
  const [compactState, setCompactState] = useState<WorkspaceState | null>(null);
  if (!compact && compactState !== null) setCompactState(null);
  const derived: WorkspaceState = compact ? { ...stored, preset: compactSpec.id, layout: presetTree(compactSpec.layout, panelOrder(stored.layout)) } : stored;
  const state = compact ? (compactState ?? derived) : stored;

  const [maximized, setMaximized] = useState<string | null>(null);
  const shown = panelOrder(state.layout);
  const maximizedId = maximized !== null && shown.includes(maximized) ? maximized : null;

  // Height mode (#686). Stack shows only at a width where the workspace is not narrow; the stored mode and rows survive a narrow spell untouched.
  const stackActive = stored.mode === 'stack' && !narrow;
  const count = topLevelRows(stored.layout).length;
  const storedRows = stored.rows !== undefined && stored.rows.length === count ? stored.rows : undefined;
  const fitSlot = useRef<HTMLDivElement>(null);
  const lastFit = useRef<number | null>(null);
  const visible = useVisibleAreaHeight(root, true);
  const maxRow = visible ?? DEFAULT_VISIBLE;
  // The height fit mode gives the layout, the same input whichever mode shows: measured while fit shows, kept while stack does.
  useLayoutEffect(() => {
    const element = fitSlot.current;
    if (!element || stackActive) return;
    const read = (height: number) => { if (height > 0) lastFit.current = height; };
    read(element.getBoundingClientRect().height);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => { const entry = entries[entries.length - 1]; if (entry) read(entry.contentRect.height); });
    observer.observe(element);
    return () => { observer.disconnect(); };
  }, [stackActive]);
  useRegisterPageFlow(stackActive);

  // Commands read the latest render at call time, so their identity depends on what they display only.
  const live = useRef({ compact, narrow, derived, presets, primaryId, rowMinimum, maxRow, stackActive, maximizedId });
  useLayoutEffect(() => { live.current = { compact, narrow, derived, presets, primaryId, rowMinimum, maxRow, stackActive, maximizedId }; });
  const rowEnv = (): RowEnv => ({ minimum: live.current.rowMinimum, maximum: live.current.maxRow, baseline: lastFit.current ?? Math.max(NEW_ROW_HEIGHT, live.current.maxRow - TOOLBAR_CHROME) });
  /** `keep`: an edit; rows follow the panels (`created`: the panel the edit moved into a row of its own, which is then a new row). `enter`: preset or reset; rows come from the new shares and the fit baseline, so repeating it cannot add height. `raw`: the edit decided the rows itself. */
  const update = useCallback((change: (current: WorkspaceState) => WorkspaceState, settle: 'keep' | 'enter' | 'raw' = 'keep', created?: string) => {
    if (live.current.compact) setCompactState(previous => change(previous ?? live.current.derived));
    else setStored(previous => { const next = change(previous); return settle === 'raw' ? next : settleRows(previous, next, settle, rowEnv(), created); });
  }, []);
  // Reveal request (#690): the active tab only, persisted like a user activation. The seq present at mount counts as handled.
  const knownIds = panels.map(panel => panel.id).join('|');
  const handledSeq = useRef(revealRequest?.seq);
  const revealSeq = revealRequest?.seq;
  const revealId = revealRequest?.panelId;
  const [dockReveal, setDockReveal] = useState<{ panelId: string; seq: number } | null>(null);
  useEffect(() => {
    if (revealSeq === undefined || revealId === undefined || revealSeq === handledSeq.current) return;
    handledSeq.current = revealSeq;
    if (!knownIds.split('|').includes(revealId)) {
      if (!isProductionEnv(import.meta as { env?: { PROD?: boolean } }, globalThis as { process?: { env?: { NODE_ENV?: string } } })) console.error(`[PanelWorkspace] revealRequest names "${revealId}", which is not a panel`);
      return;
    }
    // The user chose another panel's focus: not ended, not queued. A hidden panel is not in the layout, so the change below leaves it hidden.
    const other = live.current.maximizedId;
    if (other !== null && other !== revealId) return;
    update(current => { const home = groupOf(current.layout, revealId); return home && home.active !== revealId ? { ...current, layout: activatePanel(current.layout, revealId) } : current; });
    // The one-group narrow display has its own selection; a hidden panel is not in the layout, so it is not forwarded.
    if (panelOrder(live.current.derived.layout).includes(revealId)) setDockReveal({ panelId: revealId, seq: revealSeq });
  }, [revealSeq, revealId, knownIds, update]);
  const setMode = useCallback((mode: 'fit' | 'stack') => {
    if (live.current.narrow) return;
    if (mode === 'stack' && fitSlot.current && !live.current.stackActive) { const height = fitSlot.current.getBoundingClientRect().height; if (height > 0) lastFit.current = height; }
    update(current => {
      if (mode === 'fit') return current.mode === 'stack' ? withRows(current, 'fit') : current;
      const env = rowEnv();
      return current.mode === 'stack' ? current : withRows(current, 'stack', enterRows(current.layout, env.baseline, env.minimum, env.maximum));
    }, 'raw');
  }, [update]);
  // Stack mode whose rows are not known (a stored mode without usable rows): measured once, before paint.
  useLayoutEffect(() => {
    if (!stackActive || storedRows !== undefined || visible === null) return;
    setStored(previous => {
      if (previous.mode !== 'stack' || previous.rows?.length === topLevelRows(previous.layout).length) return previous;
      const env = rowEnv();
      return withRows(previous, 'stack', enterRows(previous.layout, env.baseline, env.minimum, env.maximum));
    });
  }, [stackActive, storedRows, visible]);

  // Restored rows obey the visible-height cap once, when a scrollport measurement first exists. Not again: a later window resize never rewrites the preference.
  const restoreClamped = useRef(false);
  useLayoutEffect(() => {
    if (restoreClamped.current || !stackActive || storedRows === undefined || visible === null) return;
    restoreClamped.current = true;
    setStored(previous => {
      if (previous.mode !== 'stack' || previous.rows === undefined || previous.rows.length !== topLevelRows(previous.layout).length) return previous;
      const minimums = topLevelRows(previous.layout).map(live.current.rowMinimum);
      const clamped = previous.rows.map((px, index) => clampRow(px, minimums[index]!, live.current.maxRow));
      return clamped.every((px, index) => px === previous.rows![index]) ? previous : withRows(previous, 'stack', clamped);
    });
  }, [stackActive, storedRows, visible]);

  const shape = JSON.stringify({
    narrow,
    stack: stored.mode === 'stack',
    presets: presets.map(preset => [preset.id, tx(preset.label)]),
    current: state.preset,
    hidden: state.hidden.map(id => [id, titleOf(id), badgeOf(id)?.description ?? null, badgeOf(id)?.tone === 'warning']),
  });
  const commands = useMemo<readonly WorkspaceCommand[]>(() => {
    const parsed = JSON.parse(shape) as { narrow: boolean; stack: boolean; presets: [string, string][]; current: string; hidden: [string, string, string | null, boolean][] };
    const preset = (id: string) => live.current.presets.find(candidate => candidate.id === id);
    return [
      ...parsed.presets.map(([id, text]): WorkspaceCommand => ({
        id: `${PRESET_PREFIX}${id}`, label: text, kind: 'radio', checked: id === parsed.current, disabled: parsed.narrow,
        run: () => { const next = preset(id); if (next && !live.current.narrow) update(current => applyPreset(current, next), 'enter'); },
      })),
      ...(['fit', 'stack'] as const).map((mode): WorkspaceCommand => ({
        id: `${MODE_PREFIX}${mode}`, label: tx(mode === 'fit' ? workspaceText.modeFit : workspaceText.modeStack), kind: 'radio', group: 'mode', groupLabel: tx(workspaceText.heightMode),
        checked: (mode === 'stack') === parsed.stack, disabled: parsed.narrow, run: () => { setMode(mode); },
      })),
      ...parsed.hidden.map(([id, text, description, warning]): WorkspaceCommand => ({
        id: `${SHOW_PREFIX}${id}`, label: tx(workspaceText.showPanel(text)), kind: 'action', description: description ?? undefined, warning: warning || undefined,
        run: () => { update(current => showPanel(current, id, live.current.primaryId, preset(current.preset) ?? live.current.presets[0]!)); },
      })),
      {
        id: RESET_ID, label: tx(workspaceText.resetLayout), kind: 'action',
        run: () => { const next = preset(parsed.current) ?? live.current.presets[0]!; update(current => resetLayout(current, next), 'enter'); },
      },
    ];
  }, [shape, update, setMode, tx]);
  const hosted = useRegisterWorkspaceCommands(commands, depth);

  // Local preference: only the stored state, never the compact overlay.
  const persisted = useRef(stored);
  const pending = useRef<WorkspaceState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    const next = pending.current;
    pending.current = null;
    if (next && storageKey) { writeWorkspaceState(storageKey, next); persisted.current = next; }
  }, [storageKey]);
  useEffect(() => {
    if (!storageKey) return;
    clearTimeout(timer.current);
    // Back to what is already stored (a change undone within the delay): nothing to write.
    if (sameWorkspaceState(stored, persisted.current)) { pending.current = null; return; }
    pending.current = stored;
    timer.current = setTimeout(flush, WORKSPACE_WRITE_DELAY_MS);
  }, [stored, storageKey, flush]);
  useEffect(() => {
    window.addEventListener('pagehide', flush);
    return () => { window.removeEventListener('pagehide', flush); flush(); };
  }, [flush]);

  const dockPanels: DockPanel[] = panels.filter(panel => shown.includes(panel.id)).map(panel => ({
    id: panel.id, title: tx(panel.title), minWidth: panel.minWidth, minHeight: panel.minHeight,
    render: () => <InWorkspacePanelProvider value>{panel.render()}</InWorkspacePanelProvider>,
  }));
  // Badges reach the tab through these two callbacks; their identity follows the badges alone, so other changes do not rebuild the tabs.
  const badgeSignature = JSON.stringify(panels.map(panel => [panel.id, panel.badge ? [panel.badge.count ?? null, panel.badge.tone ?? 'neutral', tx(panel.badge.description), tx(panel.title)] : null]));
  const badges = useMemo(() => new Map((JSON.parse(badgeSignature) as [string, [number | null, 'neutral' | 'warning', string, string] | null][]).flatMap(([id, badge]) => (badge ? [[id, badge] as const] : []))), [badgeSignature]);
  const renderTab = useMemo(() => {
    if (badges.size === 0) return undefined;
    return (panelId: string) => {
      const badge = badges.get(panelId);
      return badge ? <><span className="truncate">{badge[3]}</span><PanelBadge count={badge[0] ?? undefined} tone={badge[1]} description={badge[2]} /></> : undefined;
    };
  }, [badges]);
  const tabA11y = useMemo(() => {
    if (badges.size === 0) return undefined;
    return (panelId: string) => { const badge = badges.get(panelId); return badge ? { description: badge[2] } : undefined; };
  }, [badges]);
  const reading = dockGroupsInReadingOrder(state.layout);
  const focusTab = (panelId: string) => { focusTabSoon(() => root.current, panelId); };
  const closeFocus = useRef<(() => void) | null>(null);
  const layoutChange = (change: (current: WorkspaceState) => WorkspaceState, created?: string) => { update(change, 'keep', created); };
  const moveBelow = (id: string) => { layoutChange(current => (panelOrder(current.layout).includes(id) ? { ...current, layout: moveToNewRow(current.layout, id) } : current), id); };

  // Stack rows: stored px raised to each row's current minimum (a panel's minimum can change); the maximum only limits what the user asks for.
  const stackRows = stackActive ? storedRows : undefined;
  // The panel the engine's last drop moved, until the engine reports the resulting layout (`DockRows.onPanelDrop`); used once.
  const dropped = useRef<string | null>(null);
  const onPanelDrop = useCallback((panelId: string | null) => { dropped.current = panelId; }, []);
  const rowMinimums = stackRows ? topLevelRows(state.layout).map(rowMinimum) : [];
  const rows: DockRows | undefined = stackRows ? {
    heights: stackRows.map((px, index) => Math.max(px, rowMinimums[index]!)), minimums: rowMinimums, maximum: maxRow,
    onHeightsChange: next => {
      setStored(previous => {
        const minimums = topLevelRows(previous.layout).map(live.current.rowMinimum);
        if (previous.mode !== 'stack' || next.length !== minimums.length) return previous;
        return withRows(previous, 'stack', next.map((px, index) => clampRow(px, minimums[index]!, Math.max(live.current.maxRow, px))));
      });
    },
    onDropBelow: moveBelow, onPanelDrop, dropBelowLabel: tx(workspaceText.dropBelow),
  } : undefined;

  const groupActions = (group: { panels: string[]; active: string }) => {
    const id = group.active;
    const menu = dockLayoutMenu(state.layout, id, { maximized: maximizedId !== null && group.panels.includes(maximizedId), orderOf: other => reading.indexOf(other as (typeof reading)[number]) });
    return <WorkspaceGroupActions key={id} title={titleOf(id)} titleOf={titleOf} menu={menu} closeFocus={closeFocus}
      onMaximize={maximize => { setMaximized(maximize ? id : null); }}
      onSplit={position => { if (!menu.maximized && menu.split) { closeFocus.current = () => { focusTab(id); }; const target = menu.split; layoutChange(current => ({ ...current, layout: movePanel(current.layout, id, { panelId: target, position }) }), id); } }}
      onMove={target => { closeFocus.current = () => { focusTab(id); }; layoutChange(current => ({ ...current, layout: movePanel(current.layout, id, { panelId: target, position: 'center' }) })); }}
      onMoveBelow={rows && canMoveBelow(state.layout, id) ? () => { closeFocus.current = () => { focusTab(id); }; moveBelow(id); } : undefined}
      onHide={id === primaryId ? undefined : () => {
        setMaximized(null);
        const next = hidePanel(state, id, primaryId);
        closeFocus.current = () => { focusTab(tabAfterHide(state, next, id, primaryId)); };
        layoutChange(current => hidePanel(current, id, primaryId));
      }} />;
  };

  return <WorkspaceDepthProvider value={depth}>
    <div ref={root} data-panel-workspace data-workspace-mode={rows ? 'stack' : 'fit'} data-workspace-compact={compact ? '' : undefined} data-workspace-density={densePage ? 'compact' : undefined} className={cn(rows ? 'flex w-full min-w-0 flex-col' : 'flex h-full min-h-0 w-full min-w-0 flex-col', densePage ? 'gap-1.5' : 'gap-2')}>
      {!hosted && <WorkspaceToolbar commands={commands} onShown={focusTab} />}
      <div ref={fitSlot} className={rows ? undefined : 'min-h-0 flex-1'}>
        <DockLayoutBase panels={dockPanels} layout={state.layout} label={tx(label)} rows={rows} reveal={dockReveal} renderTab={renderTab} tabA11y={tabA11y}
          onLayoutChange={next => { const moved = dropped.current ?? undefined; dropped.current = null; layoutChange(current => ({ ...current, layout: next }), moved); }}
          onActivate={id => { layoutChange(current => (panelOrder(current.layout).includes(id) ? { ...current, layout: activatePanel(current.layout, id) } : current)); }}
          maximizedPanelId={maximizedId} onMaximizedChange={setMaximized}
          renderGroupActions={groupActions}
          separatorLabel={info => tx(info.after.length === 0 ? workspaceText.separatorRowBottom(titleOf(info.before[0]!)) : (info.dir === 'row' ? workspaceText.separatorColumns : workspaceText.separatorRows)(titleOf(info.before[0]!), titleOf(info.after[0]!)))}
          stackBelow={compactSpec ? undefined : compactBelow} />
      </div>
    </div>
  </WorkspaceDepthProvider>;
}
