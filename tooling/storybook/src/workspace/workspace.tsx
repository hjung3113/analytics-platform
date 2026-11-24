import type { ReactNode } from 'react';
import type { PanelDeclaration } from '@ap/contracts';
import { usePlatform } from '@ap/kernel';
import { PanelRecipeBack, panelRecipe, type PanelWorkspacePanel, type PanelWorkspacePreset } from '@ap/components';
import { EQUIPMENT, PROCESSES } from '../equipment';
import { platformDecorator } from '../platform';

const t = (ko: string, en: string) => ({ ko, en });
const list = (rows: [string, string][]) => <ul className="grid gap-1 p-3 text-sm">{rows.map(([name, value]) => <li key={name} className="flex justify-between"><span>{name}</span><span className="tabular">{value}</span></li>)}</ul>;

// Three panels of the mock analysis menu. The workspace owns tabs, drag, split, maximize and the local layout; the menu owns the bodies.
export const PANELS = (face: (id: string, front: ReactNode) => ReactNode = (_, front) => front): PanelWorkspacePanel[] => [
  { id: 'util', title: t('설비별 가동률', 'Utilization by equipment'), primary: true, render: () => face('util', list(EQUIPMENT.map(e => [e.id, `${e.util}%`]))) },
  { id: 'alarms', title: t('설비별 알람', 'Alarms by equipment'), render: () => face('alarms', list(EQUIPMENT.map(e => [e.id, `${e.alarms}건`]))) },
  { id: 'cycle', title: t('공정별 사이클타임', 'Cycle time by process'), render: () => face('cycle', list(PROCESSES.map(p => { const of = EQUIPMENT.filter(e => e.process === p); return [p, `${Math.round(of.reduce((s, e) => s + e.cycle, 0) / of.length)}초`]; }))) },
];
const group = (panels: string[]) => ({ type: 'group' as const, panels });
export const PRESETS: PanelWorkspacePreset[] = [
  { id: 'balanced', label: t('균형', 'Balanced'), layout: { type: 'branch', dir: 'row', sizes: [60, 40], children: [group(['util']), group(['alarms', 'cycle'])] } },
  { id: 'focus', label: t('집중', 'Focus'), layout: group(['util', 'alarms', 'cycle']) },
];

// The Registry side of the same panels: what `panelRecipe` reads (endpoints, grain, pieces, inputs).
const endpoint = (id: string) => ({ id, menuId: 'storybook', permission: 'platform:view' as const });
const DECLARED: PanelDeclaration[] = [
  { id: 'util', title: t('설비별 가동률', 'Utilization by equipment'), queryInputs: {}, displayInputs: {}, outputs: [], grain: 'equipment', endpoints: [endpoint('equipment.util')], pieces: ['AnalysisChart', 'QueryView'] },
  { id: 'alarms', title: t('설비별 알람', 'Alarms by equipment'), queryInputs: {}, displayInputs: {}, outputs: [], grain: 'equipment', endpoints: [endpoint('equipment.alarms')], pieces: ['PlatformDataTable', 'QueryView'] },
  { id: 'cycle', title: t('공정별 사이클타임', 'Cycle time by process'), queryInputs: {}, displayInputs: {}, outputs: [], grain: 'process', endpoints: [endpoint('process.cycle')], pieces: ['AnalysisChart'] },
];
export const workspacePage = platformDecorator({ features: { export: true }, menu: { panels: DECLARED } });

/** The back face of one panel, built the way a menu builds it: the Registry panel, the menu's features and the host's facts. */
export function RecipeBack({ id, close }: { id: string; close: () => void }) {
  const { registry, route } = usePlatform();
  const panel = registry.panels('storybook').find(item => item.id === id);
  if (!panel || !route) return null;
  const recipe = panelRecipe({ panel, menu: route.menu, context: {}, host: { add: false, pin: false, hide: id !== 'util', layout: true, maximize: true, range: id !== 'alarms' },
    labels: { grains: { equipment: t('설비', 'Equipment'), process: t('공정', 'Process') } }, shape: id === 'alarms' ? t('표', 'Table') : t('막대', 'Bars') });
  return <PanelRecipeBack recipe={recipe} onClose={close} />;
}
