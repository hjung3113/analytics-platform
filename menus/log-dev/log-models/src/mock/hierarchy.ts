import type { HierarchyNode, HierarchyPage } from '@ap/contracts';
import { models, projects, fixtureId } from './fixtures';

type Params = Record<string, unknown>;
const cursors = new Map<string, { binding: string; after: string }>();
function graph(): HierarchyNode[] {
  const nodes = new Map<string, HierarchyNode>();
  for (const model of models) {
    const v = `v/${model.vendorId}`;
    nodes.set(v, { id: v, parentId: null, kind: 'vendor', label: model.vendorName, hasChildren: false, target: { menuId: 'log-models', page: { vendorId: model.vendorId } } });
    const project = projects.find(p => p.modelId === model.id && !['completed', 'cancelled'].includes(p.stage));
    for (const process of model.processes.length ? model.processes : [{ id: 'none', name: '미분류' }]) {
      const p = `${v}/p/${process.id}`, m = `${p}/m/${model.id}`;
      const target: HierarchyNode['target'] = project ? { menuId: 'log-model-project', params: { projectId: project.id }, page: { node: m } } : { menuId: 'log-models', page: { vendorId: model.vendorId, processId: process.id, modelId: model.id } };
      nodes.set(p, { id: p, parentId: v, kind: 'process', label: process.name, hasChildren: false, target: { menuId: 'log-models', page: { vendorId: model.vendorId, processId: process.id } } });
      nodes.set(m, { id: m, parentId: p, kind: 'model', label: model.name, hasChildren: false, target });
      if (model.id === fixtureId(1)) {
        const s = `${m}/s/${fixtureId(31)}`;
        nodes.set(s, { id: s, parentId: m, kind: 'software', label: '3.2.1', hasChildren: false, target: project ? { ...target, page: { node: s } } : target });
      }
    }
  }
  const parents = new Set([...nodes.values()].map(n => n.parentId));
  return [...nodes.values()].map(n => ({ ...n, hasChildren: parents.has(n.id) })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
export function validateHierarchy(p: Params): string | null {
  const allowed = p.op === 'children' ? ['op', 'parentId', 'cursor', 'limit'] : p.op === 'ancestors' ? ['op', 'nodeId'] : p.op === 'search' ? ['op', 'query', 'cursor', 'limit'] : [];
  if (!allowed.length || Object.keys(p).some(k => !allowed.includes(k))) return 'hierarchy params do not match op';
  if (p.op === 'ancestors') return typeof p.nodeId === 'string' ? null : 'nodeId required';
  if (p.limit !== undefined && (typeof p.limit !== 'number' || !Number.isSafeInteger(p.limit) || p.limit < 1)) return 'invalid limit';
  if (p.cursor !== undefined && (typeof p.cursor !== 'string' || !cursors.has(p.cursor))) return 'cursor_invalid';
  return p.op === 'search' && (typeof p.query !== 'string' || !p.query.trim() || p.query.length > 200) ? 'invalid query' : null;
}
export function readHierarchy(p: Params, actor: string): HierarchyPage | HierarchyNode[] | { failure: 'deleted' | 'error' } {
  const nodes = graph();
  if (p.op === 'ancestors') {
    let node = nodes.find(n => n.id === p.nodeId);
    if (!node) return { failure: 'deleted' };
    const ancestors: HierarchyNode[] = [];
    while (node.parentId) { const parent = nodes.find(n => n.id === node?.parentId); if (!parent) return { failure: 'deleted' }; ancestors.unshift(parent); node = parent; }
    return ancestors;
  }
  const limit = Math.min(200, Number(p.limit ?? 50));
  if (p.op === 'children' && p.parentId && !nodes.some(n => n.id === p.parentId)) return { failure: 'deleted' };
  const binding = JSON.stringify([actor, p.op, p.op === 'children' ? p.parentId ?? null : String(p.query).trim(), limit]);
  const cursor = p.cursor === undefined ? undefined : cursors.get(String(p.cursor));
  if (p.cursor !== undefined && cursor?.binding !== binding) return { failure: 'error' };
  const selected = nodes.filter(n => (p.op === 'children' ? n.parentId === (p.parentId ?? null) : n.label.toLowerCase().includes(String(p.query).trim().toLowerCase())) && (!cursor || n.id > cursor.after));
  let nextCursor: string | undefined;
  if (selected.length > limit) {
    nextCursor = crypto.randomUUID();
    if (cursors.size >= 1000) cursors.clear();
    cursors.set(nextCursor, { binding, after: selected[limit - 1]!.id });
  }
  return { nodes: selected.slice(0, limit), ...(nextCursor ? { nextCursor } : {}) };
}
