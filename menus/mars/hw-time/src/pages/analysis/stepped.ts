import { orderRows, type ChartSeries, type PanelAddItem, type PanelOption, type PanelOptionValues, type PanelWorkspacePreset, type RowOrderSort } from '@ap/components';
import { HW_TIME_MODULE_TYPES, HW_TIME_MOTION_COLORS, type HwTimeMatrix, type HwTimeMatrixCell } from '../../endpoints';
import { HW_TIME_OVERVIEW_MESSAGES, HW_TIME_STEPPED_MESSAGES as S, HW_TIME_WORKSPACE_MESSAGES } from '../../messages';
import { disabledReason, panelDeclarations, workspacePanelContext } from './panelDeclaration';

export type Step = 1 | 2 | 3 | 4;
export const CATALOG_IDS = ['heatmap', 'trend', 'scatter', 'distribution', 'motionTable', 'moduleMotions', 'table'] as const;
export type CatalogId = typeof CATALOG_IDS[number];
export type Checks = { modules: readonly string[]; motions: readonly string[] };
export const rowLabel = (equipment: string, module: string) => `${equipment} · ${module}`;
export const stepOf = (type: string | null, motion: string | null, module: string | null): Step => {
  if (!type) return 1;
  if (!motion) return 2;
  return module ? 4 : 3;
};
/** Unknown parts remain unknown, including an empty selection. */
export function checkedSum(cell: HwTimeMatrixCell, motions: readonly string[]): number | null {
  return completeSum(motions.map(id => cell.motions[id]?.value ?? null));
}
function completeSum(values: readonly (number | null)[]): number | null {
  if (!values.length || values.some(value => value === null)) return null;
  return values.reduce<number>((sum, value) => sum + value!, 0);
}
export function validTrend(raw: string): boolean {
  const [module, motion, extra] = raw.split('/');
  return extra === undefined && HW_TIME_MODULE_TYPES.some(type => (type.modules as readonly string[]).includes(module ?? '') && (type.motions as readonly string[]).includes(motion ?? ''));
}
export function stepPreset(step: Step): PanelWorkspacePreset {
  // The left hierarchy is about 220px in the approved 1440px desktop capture. The remaining space is 34:66.
  const charts = step === 1 ? { type: 'group' as const, panels: ['current'] }
    : { type: 'branch' as const, dir: 'row' as const, sizes: [34, 66], children: [{ type: 'group' as const, panels: ['previous'] }, { type: 'group' as const, panels: ['current'] }] };
  const top = {
    type: 'branch', dir: 'row', sizes: [20, 80], children: [{ type: 'group', panels: ['tree'] }, charts],
  } satisfies PanelWorkspacePreset['layout'];
  const layout: PanelWorkspacePreset['layout'] = step === 4
    ? { type: 'branch', dir: 'column', sizes: [60, 40], children: [top, { type: 'group', panels: ['trend'] }] } : top;
  return { id: 'step', label: HW_TIME_WORKSPACE_MESSAGES.defaultLayout, layout };
}
export function workspaceOptions(step: Step): PanelOption[] {
  return [
    { id: 'sort', kind: 'choice', pageKey: 'barsSort', label: S.sort, default: 'original', choices: [
      { value: 'original', label: S.original }, { value: 'total-desc', label: S.descending }, { value: 'total-asc', label: S.ascending },
    ] },
    { id: 'group', kind: 'choice', pageKey: 'barsGroup', label: S.group, default: 'equipment', hidden: step === 1 || step === 4,
      choices: [{ value: 'equipment', label: S.equipmentModule }, { value: 'module', label: S.moduleEquipment }] },
    { id: 'minMax', kind: 'toggle', pageKey: 'barsMinMax', label: S.minMax, on: S.on, off: S.off },
    { id: 'align', kind: 'toggle', pageKey: 'align', label: S.align, on: S.on, off: S.off },
  ];
}
export function panelCatalog({ step, typeId, moduleId, trend }: { step: Step; typeId: string | null; moduleId: string | null; trend: string | null }): PanelAddItem[] {
  const context = workspacePanelContext({ step, typeId, moduleId, trend });
  const reason = (id: CatalogId) => disabledReason(panelDeclarations[id], context);
  return [
    { id: 'heatmap', title: S.heatmap, disabledReason: reason('heatmap') },
    { id: 'trend', title: S.trend, disabledReason: reason('trend') },
    { id: 'scatter', title: S.scatter, disabledReason: reason('scatter') },
    { id: 'distribution', title: S.distributionCatalog, disabledReason: reason('distribution') },
    { id: 'motionTable', title: S.motionTable, disabledReason: reason('motionTable') },
    { id: 'moduleMotions', title: { ko: S.moduleMotions.ko.replace('{module}', moduleId ?? 'Module'), en: S.moduleMotions.en.replace('{module}', moduleId ?? 'Module') }, disabledReason: reason('moduleMotions') },
    { id: 'table', title: S.table },
  ];
}

type ChartRowsArgs = { depth: Step; matrices: Readonly<Record<string, HwTimeMatrix | undefined>>; typeId: string | null; motionId: string | null; moduleId: string | null; selection: (type: string) => Checks; values?: PanelOptionValues; lang?: 'ko' | 'en'; allMotions?: boolean };
export function chartRows({ depth, matrices, typeId, motionId, moduleId, selection, values = {}, lang = 'ko', allMotions = false }: ChartRowsArgs) {
  const data = typeId ? matrices[typeId] : undefined;
  let series: ChartSeries[];
  let categories: string[];
  let levels: Map<string, readonly [string, string]>;
  if (depth === 1) {
    categories = [...new Set(Object.values(matrices).flatMap(matrix => matrix?.equipment ?? []))];
    levels = new Map(categories.map(id => [id, [id, '']]));
    series = HW_TIME_MODULE_TYPES.flatMap((type, index) => {
      const matrix = matrices[type.id];
      if (!matrix) return [];
      const checks = selection(type.id);
      return [{ id: type.id, name: type.id, color: HW_TIME_MOTION_COLORS[index]!, kind: 'bar' as const,
        points: categories.map(equipment => {
          const sums = checks.modules.map(module => {
            const cell = matrix.cells.find(cell => cell.equipmentId === equipment && cell.moduleId === module);
            return cell ? checkedSum(cell, checks.motions) : null;
          });
          const sum = completeSum(sums);
          return [equipment, sum === null ? null : sum / sums.length] as [string, number | null];
        }) }];
    });
  } else {
    const checks = selection(typeId!);
    const cells = (data?.cells ?? []).filter(cell => checks.modules.includes(cell.moduleId) && (depth < 4 || cell.moduleId === moduleId));
    categories = cells.map(cell => depth === 4 ? cell.equipmentId : rowLabel(cell.equipmentId, cell.moduleId));
    levels = new Map(cells.map((cell, index) => [categories[index]!, [cell.equipmentId, cell.moduleId]]));
    const motions = (data?.motions ?? []).filter(motion => checks.motions.includes(motion.id) && (depth === 2 || allMotions || motion.id === motionId));
    series = motions.map(motion => ({ id: motion.id, name: motion.id, color: motion.color, kind: 'bar',
      points: cells.map((cell, index) => [categories[index]!, cell.motions[motion.id]?.value ?? null]) }));
  }
  const ordered = orderRows(categories.map(category => ({ category, levels: levels.get(category)!, total: completeSum(series.map(item => item.points.find(([x]) => x === category)?.[1] ?? null)) })), {
    sort: (values.sort ?? 'original') as RowOrderSort, swap: depth > 1 && depth < 4 && values.group === 'module',
    levelLabels: depth > 1 && depth < 4 ? [HW_TIME_OVERVIEW_MESSAGES.equipment[lang], HW_TIME_OVERVIEW_MESSAGES.modules[lang]] : undefined,
  });
  series = series.map(item => {
    const byCategory = new Map(item.points);
    return { ...item, points: ordered.rows.map(row => [row.category, byCategory.get(row.category) ?? null]) };
  });
  return { series, rowGroups: ordered.groups, equipmentCount: depth === 1 ? categories.length : data?.equipment.length ?? 0, moduleCount: typeId ? selection(typeId).modules.filter(id => depth < 4 || id === moduleId).length : 0 };
}
