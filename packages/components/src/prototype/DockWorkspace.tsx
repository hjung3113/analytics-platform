/**
 * #575 P0 PoC (throwaway, never merged): the smallest adapter that lets a consumer declare panels + an initial layout and get
 * Dockview with `renderer: 'always'`, an @ap/ui-token theme, a per-panel header menu and always-visible `숨긴 패널` / `기본 배치`.
 * Panels only render; query/drill/zoom state stays in the caller (render closures are re-read on every caller render through context).
 */
import {
  createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import {
  DockviewReact, type DockviewApi, type DockviewReadyEvent, type DockviewWillDropEvent, type IDockviewHeaderActionsProps, type IDockviewPanel, type IDockviewPanelProps,
} from 'dockview-react';
import { ChevronDown, Eye, LayoutGrid, MoreHorizontal } from 'lucide-react';
import { useI18n } from '@ap/kernel';
import {
  Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@ap/ui';
import './dock.css';

export type DockPanelDef = { id: string; title: string; render: () => ReactNode; minWidth?: number; minHeight?: number };
/** One step of the initial layout, applied in order. `of` + `side` place it relative to an earlier panel (`within` = same tab group); `side` alone docks at the workspace edge. */
export type DockPlacement = {
  id: string; of?: string; side?: 'left' | 'right' | 'above' | 'below' | 'within';
  width?: number; height?: number; /** `within` only: keep the previously active tab visible. */ inactive?: boolean;
};
export type DockActions = { merge?: boolean; move?: boolean; maximize?: boolean; hide?: boolean };

export type DockWorkspaceProps = {
  panels: readonly DockPanelDef[];
  layout: readonly DockPlacement[];
  /** Panel whose group starts maximized. */
  maximizeOnStart?: string;
  /** Which header-menu entries and drops exist; all on by default. `merge: false` also refuses centre drops (tab merging). */
  actions?: DockActions;
  /** Turns drag and drop off entirely (the fixed-grid control variant). */
  disableDnd?: boolean;
  /** The selected panel for hosts that mirror it (the board's Context bar). */
  onActivePanelChange?: (id: string | null) => void;
  label: string;
};

const PanelsContext = createContext<ReadonlyMap<string, DockPanelDef>>(new Map());
const ActionsContext = createContext<Required<DockActions>>({ merge: true, move: true, maximize: true, hide: true });
const PanelStateContext = createContext<{ visible: boolean }>({ visible: true });

/** Whether the panel's tab is the one on screen. Hidden `always` panels stay mounted, so hosts use this to pause work or overlays. */
export function useDockPanelVisible(): boolean { return useContext(PanelStateContext).visible; }

const TEXT = {
  ko: {
    hidden: '숨긴 패널', hiddenNone: '숨긴 패널 없음', reset: '기본 배치', panelActions: (t: string) => `${t} 패널 동작`, merge: '탭으로 합치기', mergeNone: '합칠 다른 그룹 없음',
    left: '왼쪽으로 이동', right: '오른쪽으로 이동', above: '위로 이동', below: '아래로 이동', maximize: '최대화', restore: '최대화 해제', hide: '숨기기',
    maximizedNote: '최대화 중 · Esc로 되돌립니다', toolbar: (l: string) => `${l} 배치`,
  },
  en: {
    hidden: 'Hidden panels', hiddenNone: 'No hidden panels', reset: 'Default layout', panelActions: (t: string) => `${t} panel actions`, merge: 'Merge as tab', mergeNone: 'No other group to merge into',
    left: 'Move left', right: 'Move right', above: 'Move up', below: 'Move down', maximize: 'Maximize', restore: 'Restore size', hide: 'Hide',
    maximizedNote: 'Maximized · Esc restores', toolbar: (l: string) => `${l} layout`,
  },
} as const;

function useText() { return TEXT[useI18n().lang === 'en' ? 'en' : 'ko']; }

function PanelHost({ api }: IDockviewPanelProps) {
  const defs = useContext(PanelsContext);
  const [visible, setVisible] = useState(api.isVisible);
  useEffect(() => {
    setVisible(api.isVisible);
    const subscription = api.onDidVisibilityChange(event => { setVisible(event.isVisible); });
    return () => { subscription.dispose(); };
  }, [api]);
  return <PanelStateContext.Provider value={{ visible }}>
    <div data-dock-panel={api.id} className="h-full min-h-0 min-w-0 overflow-auto">{defs.get(api.id)?.render() ?? null}</div>
  </PanelStateContext.Provider>;
}

const COMPONENTS = { panel: PanelHost };
/** Module-level so the option object keeps its identity across renders (a new one re-applies the theme). */
const THEME = { name: 'ap', className: 'ap-dock', gap: 6 };
const DIRECTIONS = ['left', 'right', 'above', 'below'] as const;

/** `adjacentGroupInDirection` takes up/down, the menu says above/below. */
const NAVIGATION = { left: 'left', right: 'right', above: 'up', below: 'down' } as const;

function PanelMenuItems({ panel, api }: { panel: IDockviewPanel; api: DockviewApi }) {
  const text = useText();
  const actions = useContext(ActionsContext);
  const group = panel.group;
  const others = api.groups.filter(candidate => candidate.id !== group.id && candidate.activePanel);
  const maximized = panel.api.isMaximized();
  return <>
    {actions.merge && <DropdownMenuSub>
      <DropdownMenuSubTrigger disabled={others.length === 0}>{others.length === 0 ? text.mergeNone : text.merge}</DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {others.map(other => <DropdownMenuItem key={other.id} onSelect={() => { panel.api.moveTo({ group: other, position: 'center' }); }}>{other.activePanel?.title ?? other.id}</DropdownMenuItem>)}
      </DropdownMenuSubContent>
    </DropdownMenuSub>}
    {actions.move && DIRECTIONS.map(direction => {
      // A neighbour on that side: dock to its outer edge; none: split off from this group (needs another tab to split from).
      const neighbour = api.adjacentGroupInDirection(group, NAVIGATION[direction]);
      const canSplit = group.panels.length > 1;
      return <DropdownMenuItem key={direction} disabled={!neighbour && !canSplit}
        onSelect={() => { panel.api.moveTo({ group: (neighbour as typeof group | undefined) ?? group, position: direction === 'above' ? 'top' : direction === 'below' ? 'bottom' : direction }); }}>{text[direction]}</DropdownMenuItem>;
    })}
    {(actions.merge || actions.move) && (actions.maximize || actions.hide) && <DropdownMenuSeparator />}
    {actions.maximize && <DropdownMenuItem onSelect={() => { if (maximized) panel.api.exitMaximized(); else panel.api.maximize(); }}>{maximized ? text.restore : text.maximize}</DropdownMenuItem>}
    {actions.hide && <DropdownMenuItem onSelect={() => { panel.api.close(); }}>{text.hide}</DropdownMenuItem>}
  </>;
}

function HeaderActions({ activePanel, containerApi }: IDockviewHeaderActionsProps) {
  const text = useText();
  const actions = useContext(ActionsContext);
  if (!activePanel || !(actions.merge || actions.move || actions.maximize || actions.hide)) return null;
  return <div className="flex h-full items-center pr-1">
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon-xs" aria-label={text.panelActions(activePanel.title ?? activePanel.id)}><MoreHorizontal className="size-3.5" aria-hidden /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end"><PanelMenuItems panel={activePanel} api={containerApi} /></DropdownMenuContent>
    </DropdownMenu>
  </div>;
}

function build(api: DockviewApi, defs: ReadonlyMap<string, DockPanelDef>, layout: readonly DockPlacement[], maximizeOnStart?: string) {
  for (const step of layout) {
    const def = defs.get(step.id);
    if (!def) continue;
    api.addPanel({
      id: def.id, component: 'panel', title: def.title, renderer: 'always', minimumWidth: def.minWidth, minimumHeight: def.minHeight,
      initialWidth: step.width, initialHeight: step.height, inactive: step.inactive,
      position: step.of ? { referencePanel: step.of, direction: step.side ?? 'within' } : step.side && step.side !== 'within' ? { direction: step.side } : undefined,
    });
  }
  const target = maximizeOnStart ? api.getPanel(maximizeOnStart) : undefined;
  if (target) api.maximizeGroup(target);
}

export function DockWorkspace({ panels, layout, maximizeOnStart, actions, disableDnd = false, onActivePanelChange, label }: DockWorkspaceProps) {
  const text = useText();
  const resolved = useMemo<Required<DockActions>>(() => ({ merge: true, move: true, maximize: true, hide: true, ...actions }), [actions]);
  const defs = useMemo(() => new Map(panels.map(def => [def.id, def])), [panels]);
  const [api, setApi] = useState<DockviewApi | null>(null);
  const [openIds, setOpenIds] = useState('');
  const [maximized, setMaximized] = useState(false);
  // The ready handler and reset read the latest declaration without re-subscribing.
  const latest = useRef({ defs, layout, maximizeOnStart, onActivePanelChange, merge: resolved.merge });
  useLayoutEffect(() => { latest.current = { defs, layout, maximizeOnStart, onActivePanelChange, merge: resolved.merge }; });

  const sync = useCallback((target: DockviewApi) => {
    const ids = target.panels.map(panel => panel.id).sort().join('\n');
    setOpenIds(previous => (previous === ids ? previous : ids));
    setMaximized(target.hasMaximizedGroup());
  }, []);

  const onReady = useCallback((event: DockviewReadyEvent) => {
    const ready = event.api;
    if (ready.panels.length === 0) build(ready, latest.current.defs, latest.current.layout, latest.current.maximizeOnStart);
    ready.onDidLayoutChange(() => { sync(ready); });
    ready.onDidMaximizedGroupChange(() => { sync(ready); });
    ready.onDidActivePanelChange(change => { latest.current.onActivePanelChange?.(change?.panel?.id ?? null); });
    // Hide the centre overlay when tab merging is off; the drop itself is refused in `onWillDrop`.
    ready.onWillShowOverlay(overlay => { if (!latest.current.merge && overlay.position === 'center') overlay.preventDefault(); });
    sync(ready);
    latest.current.onActivePanelChange?.(ready.activePanel?.id ?? null);
    setApi(ready);
  }, [sync]);

  // Cross-instance drags (an inner panel onto the outer board, or the reverse) are refused: the engine already ignores a payload from
  // another instance (`viewId` differs); this makes the refusal explicit instead of relying on the default.
  const onWillDrop = useCallback((event: DockviewWillDropEvent) => {
    const data = event.getData();
    if (data && data.viewId !== event.api.id) { event.preventDefault(); return; }
    if (!latest.current.merge && event.position === 'center') event.preventDefault();
  }, []);

  const hidden = useMemo(() => {
    const open = new Set(openIds.split('\n'));
    return panels.filter(def => !open.has(def.id));
  }, [openIds, panels]);

  const reopen = (def: DockPanelDef) => {
    if (!api || api.getPanel(def.id)) return;
    const anchor = api.activePanel ?? api.panels[0];
    api.addPanel({
      id: def.id, component: 'panel', title: def.title, renderer: 'always', minimumWidth: def.minWidth, minimumHeight: def.minHeight,
      position: anchor ? { referencePanel: anchor.id, direction: 'right' } : undefined,
    });
  };
  const reset = () => {
    if (!api) return;
    api.clear();
    build(api, defs, layout, maximizeOnStart);
    sync(api);
  };

  return <div data-dock-workspace={label} className="flex h-full min-h-0 min-w-0 flex-col gap-1"
    onKeyDown={event => {
      if (event.key !== 'Escape' || event.defaultPrevented || !api?.hasMaximizedGroup()) return;
      event.preventDefault();
      event.stopPropagation();
      api.exitMaximizedGroup();
    }}>
    <div role="toolbar" aria-label={text.toolbar(label)} className="flex h-8 shrink-0 items-center gap-2 text-xs text-text-secondary">
      {resolved.hide && <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="secondary" size="toolbar" data-dock-hidden-trigger><Eye className="size-3.5" aria-hidden />{text.hidden} {hidden.length}<ChevronDown className="size-3.5" aria-hidden /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>{hidden.length === 0 ? text.hiddenNone : text.hidden}</DropdownMenuLabel>
          {hidden.map(def => <DropdownMenuItem key={def.id} onSelect={() => { reopen(def); }}>{def.title}</DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>}
      <Button type="button" variant="secondary" size="toolbar" data-dock-reset onClick={reset}><LayoutGrid className="size-3.5" aria-hidden />{text.reset}</Button>
      {maximized && <span role="status" data-dock-maximized-note>{text.maximizedNote}</span>}
    </div>
    <div className="min-h-0 flex-1">
      <PanelsContext.Provider value={defs}>
        <ActionsContext.Provider value={resolved}>
          <DockviewReact components={COMPONENTS} onReady={onReady} onWillDrop={onWillDrop} rightHeaderActionsComponent={HeaderActions}
            theme={THEME} defaultRenderer="always" singleTabMode="fullwidth" disableFloatingGroups disableDnd={disableDnd} />
        </ActionsContext.Provider>
      </PanelsContext.Provider>
    </div>
  </div>;
}
