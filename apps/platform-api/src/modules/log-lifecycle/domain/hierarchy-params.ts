/** Read-only hierarchy judgments; workspace and actor identity are never client parameters. */
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const NODE = new RegExp(`^v/${UUID}(?:/p/(?:${UUID}|none)(?:/m/${UUID}(?:/s/${UUID})?)?)?$`);
export const HIERARCHY_PARAM_KEYS = ['op', 'parentId', 'nodeId', 'query', 'cursor', 'limit'] as const;
export type HierarchyQuery =
  | { op: 'children'; parentId: string | null; cursor?: string; limit: number }
  | { op: 'ancestors'; nodeId: string }
  | { op: 'search'; query: string; cursor?: string; limit: number };
type Judgment = { ok: true; value: HierarchyQuery } | { ok: false; message: string };
export function parseHierarchyParams(p: Record<string, unknown>): Judgment {
  const fail = (message: string): Judgment => ({ ok: false, message });
  const allowed = p.op === 'children' ? ['op', 'parentId', 'cursor', 'limit'] : p.op === 'ancestors' ? ['op', 'nodeId'] : p.op === 'search' ? ['op', 'query', 'cursor', 'limit'] : [];
  if (!allowed.length || Object.keys(p).some(key => !allowed.includes(key))) return fail('hierarchy params do not match op');
  if (p.op === 'ancestors') return typeof p.nodeId === 'string' && NODE.test(p.nodeId) ? { ok: true, value: { op: 'ancestors', nodeId: p.nodeId } } : fail('nodeId must be a hierarchy path');
  if (p.cursor !== undefined && (typeof p.cursor !== 'string' || !p.cursor.length || p.cursor.length > 4096)) return fail('cursor must be a non-empty string of at most 4096 characters');
  if (p.limit !== undefined && (typeof p.limit !== 'number' || !Number.isSafeInteger(p.limit) || p.limit < 1)) return fail('limit must be a positive integer');
  const paging = { limit: Math.min(200, (p.limit as number | undefined) ?? 50), ...(p.cursor === undefined ? {} : { cursor: p.cursor as string }) };
  if (p.op === 'search') return typeof p.query === 'string' && p.query.trim().length > 0 && p.query.length <= 200 ? { ok: true, value: { op: 'search', query: p.query.trim(), ...paging } } : fail('query must contain 1 to 200 characters');
  if (p.parentId !== null && p.parentId !== undefined && (typeof p.parentId !== 'string' || !NODE.test(p.parentId))) return fail('parentId must be a hierarchy path or null');
  return { ok: true, value: { op: 'children', parentId: (p.parentId as string | null | undefined) ?? null, ...paging } };
}
