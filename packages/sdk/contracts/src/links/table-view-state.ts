import { isRecord } from '../guards.js';

export const MIN_GROUP_WIDTH = 60;
export const MAX_GROUP_LABEL_LENGTH = 60;
export const MAX_VIEW_TABLES = 20;
export const MAX_TABLE_KEY_LENGTH = 200;
export const MAX_GROUP_BASIS_LENGTH = 16_384;
export const MAX_COLUMN_GROUPS = 200;
export const MAX_GROUP_ID_LENGTH = 200;
export const MAX_GROUP_MEMBERS = 500;
export type StoredColumnGroupItem = { id: string; label?: string; members: string[]; width?: number };
export type StoredColumnGroups = { basis: string; items: StoredColumnGroupItem[] };
export type TableViewState = { groups?: StoredColumnGroups };

const closed = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).every(key => keys.includes(key));
const identifier = (value: unknown): value is string => typeof value === 'string' && value.length >= 1 && value.length <= MAX_GROUP_ID_LENGTH;
/**
 * The one rule for a stored column-group item (#2514): id and members 1–200 characters, at most 500 members, a trimmed
 * label of 1–60, a label on every `u:` group, a finite width of at least 60. Unknown keys and repeated ids are the
 * caller's policy: the saved-view guard rejects them, the screen's sanitize drops the item and keeps the rest.
 */
export function isStoredColumnGroupItem(value: unknown): value is StoredColumnGroupItem {
  if (!isRecord(value) || !identifier(value.id)) return false;
  if (!Array.isArray(value.members) || value.members.length > MAX_GROUP_MEMBERS || !value.members.every(identifier)) return false;
  if (value.label !== undefined && (typeof value.label !== 'string' || value.label.trim().length < 1 || value.label.trim().length > MAX_GROUP_LABEL_LENGTH)) return false;
  if (value.id.startsWith('u:') && typeof value.label !== 'string') return false;
  return value.width === undefined || (typeof value.width === 'number' && Number.isFinite(value.width) && value.width >= MIN_GROUP_WIDTH);
}
export function isStoredColumnGroups(value: unknown): value is StoredColumnGroups {
  if (!isRecord(value) || !closed(value, ['basis', 'items']) || typeof value.basis !== 'string' || value.basis.length > MAX_GROUP_BASIS_LENGTH || !Array.isArray(value.items) || value.items.length > MAX_COLUMN_GROUPS) return false;
  const ids = new Set<string>();
  for (const item of value.items) {
    if (!isStoredColumnGroupItem(item) || !closed(item, ['id', 'label', 'members', 'width']) || ids.has(item.id)) return false;
    ids.add(item.id);
  }
  return true;
}
export function isTableViewStates(value: unknown): value is Record<string, TableViewState> {
  return isRecord(value) && Object.keys(value).length <= MAX_VIEW_TABLES && Object.entries(value).every(([key, entry]) =>
    key.length >= 1 && key.length <= MAX_TABLE_KEY_LENGTH && isRecord(entry) && closed(entry, ['groups']) && (entry.groups === undefined || isStoredColumnGroups(entry.groups)));
}
