import { codepoint } from '../guards.js';

/** Applied occurrences only; implementations own atomic merge, ordering and the 20-entry cap. */
export type QueryHistoryKey = { userId: string; menuId: string; scopeId: string | null };
export type QueryHistoryEntry = { id: string; query: string; schemaVersion: 1; lastAppliedAt: number; count: number };
export type QueryHistoryStore = {
  list(key: QueryHistoryKey): Promise<readonly QueryHistoryEntry[]>;
  record(key: QueryHistoryKey, entry: QueryHistoryEntry): Promise<void>;
  remove(key: QueryHistoryKey, id: string): Promise<void>;
  clear(key: QueryHistoryKey): Promise<void>;
};
/** Unicode code-point order, independent of browser locale. */
export function compareHistoryText(a: string, b: string): number {
  const aa = Array.from(a, c => codepoint(c)); const bb = Array.from(b, c => codepoint(c));
  for (const [i, x] of aa.entries()) { const y = bb[i]; if (y === undefined) break; if (x !== y) return x - y; }
  return aa.length - bb.length;
}
export function compareQueryHistory(a: QueryHistoryEntry, b: QueryHistoryEntry): number {
  return b.lastAppliedAt - a.lastAppliedAt || b.count - a.count || compareHistoryText(a.id, b.id) || compareHistoryText(a.query, b.query);
}
/** FNV-1a over UTF-16 code units. Query equality is also required when merging hash collisions. */
export function queryHistoryId(query: string): string {
  let hash = 2166136261;
  for (let i = 0; i < query.length; i++) hash = Math.imul(hash ^ query.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}
