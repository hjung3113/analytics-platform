import { useState } from 'react';
import { pageConditionKeys, type HierarchyNode, type HierarchySource, type PageConditionCategory, type PageConditions } from '@ap/contracts';
import type { PageConditionOptionsLoader } from '@ap/components';
import type { PageConditionValues } from '@ap/kernel';
import { EQUIPMENT, PROCESSES } from '../equipment';

// A menu's mock pageConditions declaration (synthetic): what MenuMeta.pageConditions would hold.
const t = (ko: string) => ({ ko, en: ko });
export const TREE: PageConditionCategory = { id: 'line', label: t('라인 계층'), kind: { type: 'tree', key: 'node', source: 'lineTree', value: 'leaves' } };
export const DECLARATION: PageConditions = {
  categories: [
    { id: 'process', label: t('공정'), kind: { type: 'multi', key: 'process', options: { static: PROCESSES.map(p => ({ value: p, label: t(p) })) } } },
    { id: 'equipment', label: t('설비'), kind: { type: 'multi', key: 'eq', options: { endpoint: 'equipmentOptions' } } },
    TREE,
    { id: 'util', label: t('가동률'), kind: { type: 'range', key: 'util', unit: t('%'), min: 0, max: 100, step: 1 } },
    { id: 'period', label: t('기간'), required: true, kind: { type: 'date', from: 'from', to: 'to' } },
    { id: 'recipe', label: t('레시피'), disabled: { reason: t('공정을 하나만 고르면 쓸 수 있습니다') }, kind: { type: 'search', key: 'recipe' } },
  ],
  sections: [{ id: 'target', label: t('대상'), categories: ['process', 'equipment', 'line'] }, { id: 'measure', label: t('측정'), categories: ['util', 'period', 'recipe'] }],
};

// Options loader: the server answers the endpoint categories; EQ-0519 is listed but not selectable.
export const loadOptions: PageConditionOptionsLoader = async () => ({
  options: EQUIPMENT.map(e => ({ value: e.id, label: t(e.id), ...(e.id === 'EQ-0519' ? { disabledReason: t('정비 중') } : {}) })),
});

// Hierarchy source for the tree category: 1공장 → process → equipment.
const NODES: HierarchyNode[] = [
  { id: 'fab1', parentId: null, kind: 'fab', label: '1공장', hasChildren: true },
  ...PROCESSES.map(p => ({ id: p, parentId: 'fab1', kind: 'process', label: p, hasChildren: true })),
  ...EQUIPMENT.map(e => ({ id: e.id, parentId: e.process, kind: 'equipment', label: e.id, hasChildren: false })),
];
export const SOURCE: HierarchySource = {
  listChildren: async ({ parentId }) => { const nodes = NODES.filter(n => n.parentId === parentId); return { nodes, totalCount: nodes.length }; },
  resolveAncestors: async id => {
    const path: HierarchyNode[] = [];
    for (let node = NODES.find(n => n.id === id); node?.parentId;) { node = NODES.find(n => n.id === node!.parentId); if (node) path.unshift(node); }
    return path;
  },
  searchNodes: async ({ query }) => ({ nodes: NODES.filter(n => n.label.includes(query)) }),
};
export const TREE_SOURCES = { lineTree: SOURCE };
export const INPUTS_KEY = 'sb:fab1:1';

/** Controlled S1 values as the page would keep them: each change replaces the keys that category owns. */
export function useConditionValues(initial: PageConditionValues) {
  const [values, setValues] = useState(initial);
  const onChange = (id: string, next: PageConditionValues | null) => setValues(previous => {
    const category = DECLARATION.categories.find(c => c.id === id)!;
    const rest = Object.fromEntries(Object.entries(previous).filter(([key]) => !pageConditionKeys(category).includes(key)));
    return { ...rest, ...next };
  });
  return { values, onChange };
}
export const INITIAL: PageConditionValues = { process: ['식각'], eq: ['EQ-0142', 'EQ-0604'], from: ['2026-11-01T00:00:00'], to: ['2026-11-08T00:00:00'], util: { min: 80, max: null } };
