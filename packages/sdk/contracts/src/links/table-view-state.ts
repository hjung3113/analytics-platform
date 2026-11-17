import { isRecord } from '../guards.js';

export const MIN_GROUP_WIDTH = 60;
export const MAX_GROUP_LABEL_LENGTH = 60;
export const MAX_VIEW_TABLES = 20;
export const MAX_TABLE_KEY_LENGTH = 200;
export const MAX_GROUP_BASIS_LENGTH = 16_384;
export const MAX_COLUMN_GROUPS = 200;
export const MAX_GROUP_ID_LENGTH = 200;
export const MAX_GROUP_MEMBERS = 500;
export type StoredColumnGroups = { basis: string; items: { id: string; label?: string; members: string[]; width?: number }[] };
export type TableViewState = { groups?: StoredColumnGroups };

const closed = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).every(key => keys.includes(key));
const identifier = (value: unknown): value is string => typeof value === 'string' && value.length >= 1 && value.length <= MAX_GROUP_ID_LENGTH;
export function isStoredColumnGroups(value: unknown): value is StoredColumnGroups {
  if (!isRecord(value) || !closed(value, ['basis', 'items']) || typeof value.basis !== 'string' || value.basis.length > MAX_GROUP_BASIS_LENGTH || !Array.isArray(value.items) || value.items.length > MAX_COLUMN_GROUPS) return false;
  const ids = new Set<string>();
  for (const item of value.items) {
    if (!isRecord(item) || !closed(item, ['id', 'label', 'members', 'width']) || !identifier(item.id) || ids.has(item.id)) return false;
    if (!Array.isArray(item.members) || item.members.length > MAX_GROUP_MEMBERS || !item.members.every(identifier)) return false;
    if (item.label !== undefined && (typeof item.label !== 'string' || item.label.trim().length < 1 || item.label.trim().length > MAX_GROUP_LABEL_LENGTH)) return false;
    if (item.id.startsWith('u:') && typeof item.label !== 'string') return false;
    if (item.width !== undefined && (typeof item.width !== 'number' || !Number.isFinite(item.width) || item.width < MIN_GROUP_WIDTH)) return false;
    ids.add(item.id);
  }
  return true;
}
export function isTableViewStates(value: unknown): value is Record<string, TableViewState> {
  return isRecord(value) && Object.keys(value).length <= MAX_VIEW_TABLES && Object.entries(value).every(([key, entry]) =>
    key.length >= 1 && key.length <= MAX_TABLE_KEY_LENGTH && isRecord(entry) && closed(entry, ['groups']) && (entry.groups === undefined || isStoredColumnGroups(entry.groups)));
}
