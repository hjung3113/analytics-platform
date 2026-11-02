import { useCallback, useEffect, useRef, useState } from 'react';
import type { ColumnPinningState, ColumnSizingState, OnChangeFn, VisibilityState } from '@tanstack/react-table';
import { readLocalStorage, writeLocalStorage } from '@ap/ui';
import type { JsonValue } from '@ap/contracts';
import { usePreferenceController, usePreferenceState, type PreferenceController } from '@ap/kernel';

export type Preferences = { sizing: ColumnSizingState; visibility: VisibilityState; pinning: ColumnPinningState; /** Column ids in display order; `[]` = declaration order (#556a). */ order: string[] };
const defaults: Preferences = { sizing: {}, visibility: {}, pinning: { left: [], right: [] }, order: [] };
function sanitize(p: { sizing?: object; visibility?: object; pinning?: { left?: unknown }; order?: unknown } | null): Preferences {
  if (!p || typeof p !== 'object') return defaults;
  return {
    sizing: Object.fromEntries(Object.entries(p.sizing || {}).filter(([, v]) => typeof v === 'number' && v >= 60 && v <= 600)) as ColumnSizingState,
    visibility: Object.fromEntries(Object.entries(p.visibility || {}).filter(([, v]) => typeof v === 'boolean')) as VisibilityState,
    pinning: { left: Array.isArray(p.pinning?.left) ? p.pinning.left.filter((v: unknown) => typeof v === 'string') : [], right: [] },
    order: Array.isArray(p.order) ? p.order.filter((v: unknown): v is string => typeof v === 'string') : [],
  };
}
function readPreferences(key: string): Preferences {
  return readLocalStorage(key, raw => sanitize(JSON.parse(raw || 'null')), defaults);
}

/**
 * Column visibility, width and left-pin preferences per `preferenceKey` (§15, ADR-0024): in the browser, or — when the Kernel
 * carries the server preference seam (ADR-0098) — on the server under a hashed table key, shown from the server only.
 */
export function useColumnPreferences(preferenceKey: string) {
  const controller = usePreferenceController();
  const controllerState = usePreferenceState(controller);
  const [preferences, setPreferences] = useState(() => controller ? defaults : readPreferences(preferenceKey));
  // Server mode: `synced` is the (controller, key) and the controller value last shown from it; `touched` is the (controller, key) the person changed first.
  const [seen, setSeen] = useState<PreferenceController | null>(controller);
  const [seenRaw, setSeenRaw] = useState(preferenceKey);
  const [synced, setSynced] = useState<{ controller: PreferenceController; raw: string; json: string } | null>(null);
  const [touched, setTouched] = useState<{ controller: PreferenceController; raw: string } | null>(null);
  const [derived, setDerived] = useState<{ controller: PreferenceController; raw: string; key: string | null } | null>(null);
  if (seen !== controller) {
    setSeen(controller);
    setSynced(null);
    setTouched(null);
    setPreferences(controller ? defaults : readPreferences(preferenceKey));
  }
  // A raw key change is an ownership boundary on the server: the other table's values and edits do not carry over (a pending width was flushed to its own key by the write effect).
  if (seenRaw !== preferenceKey) {
    setSeenRaw(preferenceKey);
    if (controller) {
      setSynced(null);
      setTouched(null);
      setPreferences(defaults);
    }
  }
  const controllerRef = useRef(controller);
  useEffect(() => { controllerRef.current = controller; }, [controller]);
  // The hash is computed outside render; WebCrypto answers asynchronously.
  useEffect(() => {
    if (!controller) return;
    let live = true;
    void controller.tableKey(preferenceKey).then(key => { if (live) setDerived({ controller, raw: preferenceKey, key }); });
    return () => { live = false; };
  }, [controller, preferenceKey]);
  if (controller && seen === controller && seenRaw === preferenceKey && controllerState.status === 'ready' && derived?.controller === controller && derived.raw === preferenceKey && derived.key !== null) {
    const value = controller.get(derived.key);
    const json = JSON.stringify(value ?? null);
    // Every new controller value (a late server answer, an intent adopted from an older generation) is shown, unless the person already changed this table here.
    if (!(synced?.controller === controller && synced.raw === preferenceKey && synced.json === json)) {
      setSynced({ controller, raw: preferenceKey, json });
      if (!(touched?.controller === controller && touched.raw === preferenceKey)) setPreferences(sanitize(value as Parameters<typeof sanitize>[0] ?? null));
    }
  }
  // Writes follow user changes only (#823): nothing on mount; a width drag (`columnResizeMode: 'onChange'` reports every move) is written
  // 300 ms after its last change, or on pagehide/unmount; visibility, pin and reset are written at once. Memory-only when storage refuses.
  const write = useRef<'now' | 'later' | null>(null);
  // The pending write remembers the controller (account generation) it was made under; a later generation never receives it.
  const pending = useRef<{ key: string; value: Preferences; controller: PreferenceController | null } | null>(null);
  const flush = useCallback(() => {
    const next = pending.current;
    pending.current = null;
    if (!next) return;
    if (next.controller) next.controller.setTable(next.key, next.value as unknown as JsonValue);
    else writeLocalStorage(next.key, JSON.stringify(next.value));
  }, []);
  useEffect(() => {
    // A width still waiting for another key, or made under another account generation, goes to the one it was made under first.
    if (pending.current && (pending.current.key !== preferenceKey || pending.current.controller !== controllerRef.current)) flush();
    const mode = write.current;
    write.current = null;
    if (mode === null) return;
    pending.current = { key: preferenceKey, value: preferences, controller: controllerRef.current };
    if (mode === 'now') { flush(); return; }
    const timer = setTimeout(flush, 300);
    return () => clearTimeout(timer);
  }, [preferences, preferenceKey, flush]);
  useEffect(() => {
    window.addEventListener('pagehide', flush);
    return () => { window.removeEventListener('pagehide', flush); flush(); };
  }, [flush]);
  const touch = () => { if (controller) setTouched({ controller, raw: preferenceKey }); };
  const onColumnSizingChange: OnChangeFn<ColumnSizingState> = u => { touch(); write.current = 'later'; setPreferences(pr => ({ ...pr, sizing: typeof u === 'function' ? u(pr.sizing) : u })); };
  const onColumnVisibilityChange: OnChangeFn<VisibilityState> = u => { touch(); write.current = 'now'; setPreferences(pr => ({ ...pr, visibility: typeof u === 'function' ? u(pr.visibility) : u })); };
  // Only the user's left pins are stored: the merged state carries the derived right pin of `_action`.
  const onColumnPinningChange = (actionPinned: boolean): OnChangeFn<ColumnPinningState> => u => { touch(); write.current = 'now'; setPreferences(pr => {
    const next = typeof u === 'function' ? u({ left: pr.pinning.left ?? [], right: actionPinned ? ['_action'] : [] }) : u;
    return { ...pr, pinning: { left: (next.left ?? []).filter(id => id !== '_action'), right: [] } };
  }); };
  const onColumnOrderChange = (order: string[]) => { touch(); write.current = 'now'; setPreferences(pr => ({ ...pr, order })); };
  /** Visibility, width, pin and order back to the column defaults; sort, page and selection stay. */
  const resetPreferences = () => { touch(); write.current = 'now'; setPreferences({ sizing: {}, visibility: {}, pinning: { left: [], right: [] }, order: [] }); };
  return { preferences, onColumnSizingChange, onColumnVisibilityChange, onColumnPinningChange, onColumnOrderChange, resetPreferences };
}
