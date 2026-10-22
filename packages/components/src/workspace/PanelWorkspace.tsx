import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useI18n, usePlatform, type Text } from '@ap/kernel';
import { isProductionEnv } from '@ap/ui';
import { activatePanel, movePanel, panelOrder } from '../dock/commands';
import { focusTabSoon } from '../dock/focusTab';
import { DockLayout } from '../dock/DockLayout';
import type { DockPanel } from '../dock/dockTypes';
import { dockLayoutMenu } from '../dock/layoutMenu';
import { dockGroupsInReadingOrder } from '../dock/schema';
import { useRegisterWorkspaceCommands, useWorkspaceDepth, WorkspaceDepthProvider, type WorkspaceCommand } from '../dock/WorkspaceCommandsHost';
import { InWorkspacePanelProvider } from './panelContext';
import { workspaceText } from './text';
import { PRESET_PREFIX, RESET_ID, SHOW_PREFIX, WorkspaceToolbar } from './WorkspaceToolbar';
import { WorkspaceGroupActions } from './WorkspaceGroupActions';
import { readWorkspaceState, sameWorkspaceState, workspaceStorageKey, writeWorkspaceState, WORKSPACE_WRITE_DELAY_MS } from './workspaceStorage';
import { applyPreset, hidePanel, initialWorkspaceState, presetTree, resetLayout, showPanel, tabAfterHide, WORKSPACE_ID, type PanelWorkspaceLayout, type WorkspaceSpec, type WorkspaceState } from './workspaceState';

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
};

const DEFAULT_COMPACT_BELOW = 900;

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
  }, [signature]);
}

/**
 * **Candidate** (ADR-0067 decision 22): a menu's panels in a dock layout the user can rearrange. The menu declares the panels, a few
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

function WorkspaceBody({ panels, presets: given, initialPreset, compactPreset, label, compactBelow = DEFAULT_COMPACT_BELOW, storageKey }: PanelWorkspaceProps & { storageKey: string | null }) {
  const { tx } = useI18n();
  const depth = useWorkspaceDepth() + 1;
  const primaryId = (panels.find(panel => panel.primary) ?? panels[0]!).id;
  const presets: readonly PanelWorkspacePreset[] = given.length > 0 ? given : [{ id: initialPreset, label: workspaceText.layout, layout: { type: 'group', panels: panels.map(panel => panel.id) } }];
  const spec: WorkspaceSpec = { panelIds: panels.map(panel => panel.id), primaryId, presets, initialPreset };
  const titleOf = (id: string) => { const panel = panels.find(candidate => candidate.id === id); return panel ? tx(panel.title) : id; };

  const [stored, setStored] = useState<WorkspaceState>(() => (storageKey ? readWorkspaceState(storageKey, spec) : null) ?? initialWorkspaceState(spec));

  // Width of the workspace: under `compactBelow` with a compact preset the arrangement is the preset's, in memory.
  const root = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => { const entry = entries[entries.length - 1]; if (entry) setWidth(entry.contentRect.width); });
    observer.observe(element);
    return () => { observer.disconnect(); };
  }, []);
  const compactSpec = compactPreset === undefined ? undefined : presets.find(preset => preset.id === compactPreset);
  const stacked = width !== null && width < compactBelow;
  const compact = compactSpec !== undefined && stacked;
  const [compactState, setCompactState] = useState<WorkspaceState | null>(null);
  if (!compact && compactState !== null) setCompactState(null);
  const derived: WorkspaceState = compact ? { ...stored, preset: compactSpec.id, layout: presetTree(compactSpec.layout, panelOrder(stored.layout)) } : stored;
  const state = compact ? (compactState ?? derived) : stored;

  const [maximized, setMaximized] = useState<string | null>(null);
  const shown = panelOrder(state.layout);
  const maximizedId = maximized !== null && shown.includes(maximized) ? maximized : null;

  // Commands read the latest render at call time, so their identity depends on what they display only.
  const live = useRef({ compact, stacked, derived, presets, primaryId });
  useLayoutEffect(() => { live.current = { compact, stacked, derived, presets, primaryId }; });
  const update = useCallback((change: (current: WorkspaceState) => WorkspaceState) => {
    if (live.current.compact) setCompactState(previous => change(previous ?? live.current.derived));
    else setStored(previous => change(previous));
  }, []);

  const shape = JSON.stringify({
    stacked,
    presets: presets.map(preset => [preset.id, tx(preset.label)]),
    current: state.preset,
    hidden: state.hidden.map(id => [id, titleOf(id)]),
  });
  const commands = useMemo<readonly WorkspaceCommand[]>(() => {
    const parsed = JSON.parse(shape) as { stacked: boolean; presets: [string, string][]; current: string; hidden: [string, string][] };
    const preset = (id: string) => live.current.presets.find(candidate => candidate.id === id);
    return [
      ...parsed.presets.map(([id, text]): WorkspaceCommand => ({
        id: `${PRESET_PREFIX}${id}`, label: text, kind: 'radio', checked: id === parsed.current, disabled: parsed.stacked,
        run: () => { const next = preset(id); if (next && !live.current.stacked) update(current => applyPreset(current, next)); },
      })),
      ...parsed.hidden.map(([id, text]): WorkspaceCommand => ({
        id: `${SHOW_PREFIX}${id}`, label: tx(workspaceText.showPanel(text)), kind: 'action',
        run: () => { update(current => showPanel(current, id, live.current.primaryId, preset(current.preset) ?? live.current.presets[0]!)); },
      })),
      {
        id: RESET_ID, label: tx(workspaceText.resetLayout), kind: 'action',
        run: () => { const next = preset(parsed.current) ?? live.current.presets[0]!; update(current => resetLayout(current, next)); },
      },
    ];
  }, [shape, update, tx]);
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
  const reading = dockGroupsInReadingOrder(state.layout);
  const focusTab = (panelId: string) => { focusTabSoon(() => root.current, panelId); };
  const closeFocus = useRef<(() => void) | null>(null);
  const layoutChange = (change: (current: WorkspaceState) => WorkspaceState) => { update(change); };
  const groupActions = (group: { panels: string[]; active: string }) => {
    const id = group.active;
    const menu = dockLayoutMenu(state.layout, id, { maximized: maximizedId !== null && group.panels.includes(maximizedId), orderOf: other => reading.indexOf(other as (typeof reading)[number]) });
    return <WorkspaceGroupActions key={id} title={titleOf(id)} titleOf={titleOf} menu={menu} closeFocus={closeFocus}
      onMaximize={maximize => { setMaximized(maximize ? id : null); }}
      onSplit={position => { if (!menu.maximized && menu.split) { closeFocus.current = () => { focusTab(id); }; const target = menu.split; layoutChange(current => ({ ...current, layout: movePanel(current.layout, id, { panelId: target, position }) })); } }}
      onMove={target => { closeFocus.current = () => { focusTab(id); }; layoutChange(current => ({ ...current, layout: movePanel(current.layout, id, { panelId: target, position: 'center' }) })); }}
      onHide={id === primaryId ? undefined : () => {
        setMaximized(null);
        const next = hidePanel(state, id, primaryId);
        closeFocus.current = () => { focusTab(tabAfterHide(state, next, id, primaryId)); };
        layoutChange(current => hidePanel(current, id, primaryId));
      }} />;
  };

  return <WorkspaceDepthProvider value={depth}>
    <div ref={root} data-panel-workspace data-workspace-compact={compact ? '' : undefined} className="flex h-full min-h-0 w-full min-w-0 flex-col gap-2">
      {!hosted && <WorkspaceToolbar commands={commands} onShown={focusTab} />}
      <div className="min-h-0 flex-1">
        <DockLayout panels={dockPanels} layout={state.layout} label={tx(label)}
          onLayoutChange={next => { layoutChange(current => ({ ...current, layout: next })); }}
          onActivate={id => { layoutChange(current => (panelOrder(current.layout).includes(id) ? { ...current, layout: activatePanel(current.layout, id) } : current)); }}
          maximizedPanelId={maximizedId} onMaximizedChange={setMaximized}
          renderGroupActions={groupActions}
          separatorLabel={info => tx((info.dir === 'row' ? workspaceText.separatorColumns : workspaceText.separatorRows)(titleOf(info.before[0]!), titleOf(info.after[0]!)))}
          stackBelow={compactSpec ? undefined : compactBelow} />
      </div>
    </div>
  </WorkspaceDepthProvider>;
}
