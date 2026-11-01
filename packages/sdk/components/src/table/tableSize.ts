/**
 * Table size (06 §15, node 1217d): 작게 / 보통 / 크게 as a step RELATIVE to the table's context baseline (P10), one per-user setting for
 * every table. Internal module: not exported from `index.ts`.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { readLocalStorage, writeLocalStorage } from '@ap/ui';
import { usePreferenceController, usePreferenceState, type PreferenceController } from '@ap/kernel';

export type TableSize = 'small' | 'normal' | 'large';
export const TABLE_SIZES: readonly TableSize[] = ['small', 'normal', 'large'];

/** The one preference key. Browser: `localStorage[TABLE_SIZE_KEY]` (absent = 보통). Server seam: written with `setTable(TABLE_SIZE_KEY, size)`, i.e. under the hashed `columns:h1_…` key every table preference already uses (no new server key shape). */
export const TABLE_SIZE_KEY = 'platform:table-size';

/** Row height of 보통 in every context today (the `min-h-8` of header and body cells, also the virtualizer's estimate). A context with another baseline changes this one number; the steps below stay relative to it. */
export const BASE_ROW_HEIGHT = 32;
/** The font of 보통 body text (`text-sm`) and the default column width unit. */
const BASE_FONT = 'var(--text-sm)';

type Step = { /** px added to the baseline row height. */ rowDelta: number; font: string; head: string; /** Default column widths are multiplied by this (크게: the font ratio 15/13); user-resized widths are not. */ widthScale: number; ko: string; en: string };
export const TABLE_SIZE_STEPS: Record<TableSize, Step> = {
  small: { rowDelta: -4, font: 'var(--text-xs)', head: '11px', widthScale: 1, ko: '작게', en: 'Small' },
  normal: { rowDelta: 0, font: BASE_FONT, head: '12px', widthScale: 1, ko: '보통', en: 'Medium' },
  large: { rowDelta: 8, font: `calc(${BASE_FONT} + 2px)`, head: '14px', widthScale: 15 / 13, ko: '크게', en: 'Large' },
};

export function parseTableSize(raw: unknown): TableSize | null {
  return raw === 'small' || raw === 'normal' || raw === 'large' ? raw : null;
}

const localListeners = new Set<() => void>();
const readLocal = (): TableSize => readLocalStorage(TABLE_SIZE_KEY, raw => parseTableSize(raw) ?? 'normal', 'normal');
function subscribeLocal(listener: () => void) {
  localListeners.add(listener);
  const onStorage = (event: StorageEvent) => { if (event.key === null || event.key === TABLE_SIZE_KEY) listener(); };
  window.addEventListener('storage', onStorage);
  return () => { localListeners.delete(listener); window.removeEventListener('storage', onStorage); };
}

/**
 * The per-user table size, shared by every table on the page (they re-render together). With the Kernel's server preference seam
 * (ADR-0098) it lives on the server and is shown from the server only; without it, in this browser.
 */
export function useTableSize(): [TableSize, (next: TableSize) => void] {
  const controller = usePreferenceController();
  usePreferenceState(controller);
  const local = useSyncExternalStore(subscribeLocal, readLocal, () => 'normal' as TableSize);
  const [derived, setDerived] = useState<{ controller: PreferenceController; key: string | null } | null>(null);
  const [chosen, setChosen] = useState<{ controller: PreferenceController; size: TableSize } | null>(null);
  useEffect(() => {
    if (!controller) return;
    let live = true;
    void controller.tableKey(TABLE_SIZE_KEY).then(key => { if (live) setDerived({ controller, key }); });
    return () => { live = false; };
  }, [controller]);
  if (!controller) return [local, next => { writeLocalStorage(TABLE_SIZE_KEY, next === 'normal' ? null : next); for (const listener of localListeners) listener(); }];
  const served = derived?.controller === controller && derived.key !== null ? parseTableSize(controller.get(derived.key)) : null;
  return [served ?? (chosen?.controller === controller ? chosen.size : 'normal'), next => { setChosen({ controller, size: next }); controller.setTable(TABLE_SIZE_KEY, next); }];
}
