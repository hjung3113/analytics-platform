/** PROTOTYPE (#1197): local-only writes over the fixture. Nothing leaves the browser tab; a reload restores the fixture. */
import { useSyncExternalStore } from 'react';
import type { ApiResponse, ColumnFilter, ColumnFilterSpec, GroupedPageResult, TableQuery } from '@ap/contracts';
import { filterRows, sortAndPage } from '@ap/contracts';
import { ITEMS, type Assessment, type Axis, type Item } from './fixture';

let items: Item[] = ITEMS;
let revision = 0;
const listeners = new Set<() => void>();
const emit = () => { revision += 1; for (const l of listeners) l(); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function useItems(): Item[] { return useSyncExternalStore(subscribe, () => items); }
export function useRevision(): number { return useSyncExternalStore(subscribe, () => revision); }

export function addItem(draft: Omit<Item, 'id'>): string {
  const id = `KI-${100 + items.length + 1}`;
  items = [{ ...draft, id }, ...items];
  emit();
  return id;
}

export function assess(itemId: string, axis: Axis, to: string, reason: string, actor: string): void {
  items = items.map(item => {
    if (item.id !== itemId) return item;
    const from = item[axis];
    const entry: Assessment = { id: `a-local-${Date.now()}`, at: new Date().toISOString().slice(0, 16).replace('T', ' '), actor, axis, from, to, reason };
    return { ...item, [axis]: to, updatedAt: new Date().toISOString().slice(0, 10), history: [...item.history, entry] } as Item;
  });
  emit();
}

/** The local half of a `PlatformDataTable.loadPage`: filter, sort and page an in-memory list (a real screen asks the server). */
export function localPage<T>(rows: readonly T[], query: TableQuery, specs: Readonly<Record<string, ColumnFilterSpec>>, accessor?: (row: T, id: string) => unknown, extra?: (row: T) => boolean): Promise<ApiResponse<GroupedPageResult<T>>> {
  const filtered = filterRows(extra ? rows.filter(extra) : rows, query.filters as ColumnFilter[] | undefined, accessor, { specs });
  const data = sortAndPage(filtered, query);
  return Promise.resolve({ outcome: data.total === 0 ? 'empty' : 'ok', data, assessments: [], trust: null, correlationId: 'prototype-local' });
}
