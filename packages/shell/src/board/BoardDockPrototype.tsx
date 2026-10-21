/**
 * #575 P0 PoC (throwaway, never merged): the board's grid area drawn by Dockview. Three `?variant=` values on `/board`:
 * `board-grid` (fixed 2×2, resize + maximize, no dnd), `board-dock-tabs` (free docking + tab merging), `board-dock-split` (4-direction
 * split/dock, no tab merging). Panes are a fixed in-memory demo set, not the stored sheet; each keeps its own `PaneScreenProvider`
 * and the active Dockview panel is the selected pane that drives `BoardContextBar`.
 */
import { useMemo, useState, type ComponentType } from 'react';
import { DockWorkspace, useDockPanelVisible, type DockPanelDef, type DockPlacement } from '@ap/components/prototype';
import { PaneQueryDraftProvider, PaneScreenProvider, usePlatform, type PaneScreen } from '@ap/kernel';
import { QueryBarExtensionsProvider } from '@ap/components';
import { TransientOverlayScope } from '@ap/ui';
import { admitPaneScreen } from './boardMenus';
import { BoardContextBar } from './BoardContextBar';

export type BoardDockVariant = 'board-grid' | 'board-dock-tabs' | 'board-dock-split';
export const BOARD_DOCK_VARIANTS: readonly BoardDockVariant[] = ['board-grid', 'board-dock-tabs', 'board-dock-split'];
export const BOARD_SWITCHER = [
  { key: null, label: '현재 보드' }, { key: 'board-grid', label: 'board-grid · 2×2 고정' },
  { key: 'board-dock-tabs', label: 'board-dock-tabs · 탭 결합' }, { key: 'board-dock-split', label: 'board-dock-split · 4방향 분할' },
];

const CONTEXT = 'scopeId=MEM&roomNames=PHOTO&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00';
/** Three different menus, the same menu twice with different conditions (percentile), and one pane hosting the nested cycle-time workspace. */
const DEMO: { id: string; title: string; screen: PaneScreen }[] = [
  { id: 'productivity', title: '생산성 개요', screen: { menuId: 'productivity-overview', params: {}, query: `?${CONTEXT}` } },
  { id: 'equip-master', title: '설비 마스터', screen: { menuId: 'equipment-master', params: {}, query: `?${CONTEXT}` } },
  { id: 'cycle-p95', title: '사이클타임 · P95', screen: { menuId: 'cycle-time', params: {}, query: `?${CONTEXT}&percentile=p95` } },
  { id: 'cycle-p50-workspace', title: '사이클타임 · P50 (안쪽 워크스페이스)', screen: { menuId: 'cycle-time', params: {}, query: `?${CONTEXT}&percentile=p50&variant=balanced` } },
];

const LAYOUTS: Record<BoardDockVariant, { layout: DockPlacement[]; actions: { merge: boolean; move: boolean; maximize: boolean; hide: boolean }; disableDnd: boolean }> = {
  'board-grid': {
    layout: [
      { id: 'productivity' },
      { id: 'cycle-p95', of: 'productivity', side: 'right' },
      { id: 'equip-master', of: 'productivity', side: 'below' },
      { id: 'cycle-p50-workspace', of: 'cycle-p95', side: 'below' },
    ],
    actions: { merge: false, move: false, maximize: true, hide: false }, disableDnd: true,
  },
  'board-dock-tabs': {
    layout: [
      { id: 'productivity' },
      { id: 'equip-master', of: 'productivity', inactive: true },
      { id: 'cycle-p95', of: 'productivity', side: 'right' },
      { id: 'cycle-p50-workspace', of: 'cycle-p95', inactive: true },
    ],
    actions: { merge: true, move: true, maximize: true, hide: true }, disableDnd: false,
  },
  'board-dock-split': {
    layout: [
      { id: 'productivity' },
      { id: 'cycle-p95', of: 'productivity', side: 'right' },
      { id: 'equip-master', of: 'productivity', side: 'below' },
      { id: 'cycle-p50-workspace', of: 'cycle-p95', side: 'below' },
    ],
    actions: { merge: false, move: true, maximize: true, hide: true }, disableDnd: false,
  },
};

const paneIdOf = (sheetId: string, id: string) => `${sheetId}.${id}`;

function DockPane({ id, number, title, screen, Outlet, onChange, onLeave }: {
  id: string; number: number; title: string; screen: PaneScreen; Outlet: ComponentType;
  onChange: (next: PaneScreen, how: 'push' | 'replace') => void; onLeave: (href: string) => void;
}) {
  const { registry } = usePlatform();
  const visible = useDockPanelVisible();
  if (!admitPaneScreen(registry, screen)) return <p className="p-4 text-sm text-text-secondary">{title}: 보드에 올릴 수 없는 화면입니다.</p>;
  return <TransientOverlayScope active={visible}>
    <div data-pane-id={id} data-pane-index={number - 1} tabIndex={-1} className="h-full min-h-0 overflow-auto outline-none">
      <PaneScreenProvider paneId={id} paneLabel={`칸 ${number} · ${title}`} screen={screen} onChange={onChange} onLeave={onLeave}><Outlet /></PaneScreenProvider>
    </div>
  </TransientOverlayScope>;
}

export function BoardDockPrototype({ variant, sheetId, Outlet, onLeave, panelId }: {
  variant: BoardDockVariant; sheetId: string; Outlet: ComponentType; onLeave: (href: string) => void; panelId: string;
}) {
  const [screens, setScreens] = useState<Record<string, PaneScreen>>(() => Object.fromEntries(DEMO.map(item => [item.id, item.screen])));
  const [selected, setSelected] = useState<string>(DEMO[0].id);
  const config = LAYOUTS[variant];
  const panels = useMemo<DockPanelDef[]>(() => DEMO.map((item, index) => ({
    id: item.id, title: item.title, minWidth: 260, minHeight: 160,
    render: () => <DockPane id={paneIdOf(sheetId, item.id)} number={index + 1} title={item.title} screen={screens[item.id]} Outlet={Outlet} onLeave={onLeave}
      onChange={(next) => { setScreens(previous => ({ ...previous, [item.id]: next })); }} />,
  })), [screens, Outlet, onLeave, sheetId]);
  const selectedIndex = Math.max(0, DEMO.findIndex(item => item.id === selected));
  const selectedItem = DEMO[selectedIndex];
  return <PaneQueryDraftProvider key={sheetId} screens={Object.fromEntries(DEMO.map(item => [paneIdOf(sheetId, item.id), screens[item.id]]))}>
    <QueryBarExtensionsProvider>
      <BoardContextBar key={`${sheetId}.${selectedItem.id}`} paneId={paneIdOf(sheetId, selectedItem.id)} number={selectedIndex + 1} screen={screens[selectedItem.id]}
        onChange={next => { setScreens(previous => ({ ...previous, [selectedItem.id]: next })); }} onLeave={onLeave} />
      <div id={panelId} role="tabpanel" aria-labelledby={`board-tab-${sheetId}`} className="min-h-0 flex-1 p-3">
        <DockWorkspace key={`${sheetId}.${variant}`} label="분석 보드" panels={panels} layout={config.layout} actions={config.actions} disableDnd={config.disableDnd}
          onActivePanelChange={id => { if (id && DEMO.some(item => item.id === id)) setSelected(id); }} />
      </div>
    </QueryBarExtensionsProvider>
  </PaneQueryDraftProvider>;
}
