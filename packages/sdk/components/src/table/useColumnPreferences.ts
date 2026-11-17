import { useCallback, useEffect, useRef, useState } from 'react';
import type { ColumnPinningState, ColumnSizingState, OnChangeFn, VisibilityState } from '@tanstack/react-table';
import { writeLocalStorage } from '@ap/ui';
import type { JsonValue } from '@ap/contracts';
import { usePlatformOptional, usePreferenceController, usePreferenceState, type PreferenceController } from '@ap/kernel';

import { browserPreferenceKey, readBrowserPreference } from '../preferences/browserPreference';
import { sanitizeColumnGroups, type StoredColumnGroups } from './columnGroups';

export type Preferences = { sizing: ColumnSizingState; visibility: VisibilityState; pinning: ColumnPinningState; /** Column ids in display order; `[]` = declaration order (#556a). */ order: string[]; groups?: StoredColumnGroups };
const defaults: Preferences = { sizing: {}, visibility: {}, pinning: { left: [], right: [] }, order: [] };
function sanitize(p: { sizing?: object; visibility?: object; pinning?: { left?: unknown }; order?: unknown; groups?: unknown } | null): Preferences {
  if (!p || typeof p !== 'object') return defaults;
  const groups = sanitizeColumnGroups(p.groups);
  return {
    sizing: Object.fromEntries(Object.entries(p.sizing || {}).filter(([, v]) => typeof v === 'number' && v >= 60 && v <= 600)) as ColumnSizingState,
    visibility: Object.fromEntries(Object.entries(p.visibility || {}).filter(([, v]) => typeof v === 'boolean')) as VisibilityState,
    pinning: { left: Array.isArray(p.pinning?.left) ? p.pinning.left.filter((v: unknown) => typeof v === 'string') : [], right: [] },
    order: Array.isArray(p.order) ? p.order.filter((v: unknown): v is string => typeof v === 'string') : [],
    ...(groups !== undefined && { groups }),
  };
}
function readPreferences(key: string, legacyKey: string): Preferences {
  return readBrowserPreference(key, { legacyKey, decode: raw => {
    const value: unknown = JSON.parse(raw);
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? sanitize(value) : null;
  }, fallback: defaults });
}

/**
 * Column visibility, width and left-pin preferences per `preferenceKey` (§15, ADR-0024): in the browser, or — when the Kernel
 * carries the server preference seam (ADR-0098) — on the server under a hashed table key, shown from the server only.
 */
export function useColumnPreferences(preferenceKey: string) {
  const localKey = browserPreferenceKey('columns', usePlatformOptional()?.session.user.id, preferenceKey);
  const identity = localKey;
  const controller = usePreferenceController();
  const controllerState = usePreferenceState(controller);
  const [preferences, setPreferences] = useState(() => controller ? defaults : readPreferences(localKey, preferenceKey));
  // Server mode: `synced` is the (controller, key) and the controller value last shown from it; `touched` is the (controller, key) the person changed first.
  const [seen, setSeen] = useState<PreferenceController | null>(controller);
  const [seenRaw, setSeenRaw] = useState(identity);
  const [synced, setSynced] = useState<{ controller: PreferenceController; raw: string; json: string } | null>(null);
  const [touched, setTouched] = useState<{ controller: PreferenceController; raw: string } | null>(null);
  const [derived, setDerived] = useState<{ controller: PreferenceController; raw: string; key: string | null } | null>(null);
  if (seen !== controller) {
    setSeen(controller);
    setSynced(null);
    setTouched(null);
    setPreferences(controller ? defaults : readPreferences(localKey, preferenceKey));
  }
  // A raw key change is an ownership boundary on the server: the other table's values and edits do not carry over (a pending width was flushed to its own key by the write effect).
  if (seenRaw !== identity) {
    setSeenRaw(identity);
    if (controller) {
      setSynced(null);
      setTouched(null);
      setPreferences(defaults);
    } else setPreferences(readPreferences(localKey, preferenceKey));
  }
  // The hash is computed outside render; WebCrypto answers asynchronously.
  useEffect(() => {
    if (!controller) return;
    let live = true;
    void controller.tableKey(preferenceKey).then(key => { if (live) setDerived({ controller, raw: preferenceKey, key }); });
    return () => { live = false; };
  }, [controller, preferenceKey]);
  if (controller && seen === controller && seenRaw === identity && controllerState.status === 'ready' && derived?.controller === controller && derived.raw === preferenceKey && derived.key !== null) {
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
  // The pending write remembers the controller (account generation) it was made under; a later generation never receives it.
  const pending = useRef<{ key: string; value: Preferences; controller: PreferenceController | null; mode: 'now' | 'later' } | null>(null);
  const flush = useCallback(() => {
    const next = pending.current;
    pending.current = null;
    if (!next) return;
    if (next.controller) next.controller.setTable(next.key, next.value as unknown as JsonValue);
    else writeLocalStorage(next.key, JSON.stringify(next.value));
  }, []);
  useEffect(() => {
    const intent = pending.current;
    if (!intent) return;
    // Flush the captured original intent at a boundary; reset state never becomes a new owner's write.
    if (intent.key !== (controller ? preferenceKey : localKey) || intent.controller !== controller || intent.mode === 'now') {
      flush();
      return;
    }
    const timer = setTimeout(flush, 300);
    return () => clearTimeout(timer);
  }, [preferences, preferenceKey, localKey, controller, flush]);
  useEffect(() => {
    window.addEventListener('pagehide', flush);
    return () => { window.removeEventListener('pagehide', flush); flush(); };
  }, [flush]);
  // Capture owner and value together in the event, before a batched identity change can reset state.
  const updatePreferences = (update: (previous: Preferences) => Preferences, mode: 'now' | 'later') => {
    const key = controller ? preferenceKey : localKey;
    const previous = pending.current;
    const sameOwner = previous?.key === key && previous.controller === controller;
    if (previous && !sameOwner) flush();
    const value = update(sameOwner ? previous.value : preferences);
    pending.current = { key, value, controller, mode };
    if (controller) setTouched({ controller, raw: preferenceKey });
    setPreferences(value);
  };
  const onColumnSizingChange: OnChangeFn<ColumnSizingState> = u => updatePreferences(pr => ({ ...pr, sizing: typeof u === 'function' ? u(pr.sizing) : u }), 'later');
  const onColumnVisibilityChange: OnChangeFn<VisibilityState> = u => updatePreferences(pr => ({ ...pr, visibility: typeof u === 'function' ? u(pr.visibility) : u }), 'now');
  // Only the user's left pins are stored: the merged state carries the derived right pin of `_action`.
  const onColumnPinningChange = (actionPinned: boolean): OnChangeFn<ColumnPinningState> => u => updatePreferences(pr => {
    const next = typeof u === 'function' ? u({ left: pr.pinning.left ?? [], right: actionPinned ? ['_action'] : [] }) : u;
    return { ...pr, pinning: { left: (next.left ?? []).filter(id => id !== '_action'), right: [] } };
  }, 'now');
  const onColumnOrderChange = (order: string[]) => updatePreferences(pr => ({ ...pr, order }), 'now');
  /** Membership and its gathered order are one intent; width uses the same delayed write as column widths. */
  const onColumnGroupsChange = (update: (previous: Preferences) => { groups: StoredColumnGroups; order?: string[] }, mode: 'now' | 'later') => updatePreferences(pr => ({ ...pr, ...update(pr) }), mode);
  /** Visibility, width, pin and order back to the column defaults; sort, page and selection stay. */
  const resetPreferences = () => updatePreferences(() => ({ sizing: {}, visibility: {}, pinning: { left: [], right: [] }, order: [] }), 'now');
  return { preferences, onColumnSizingChange, onColumnVisibilityChange, onColumnPinningChange, onColumnOrderChange, onColumnGroupsChange, resetPreferences };
}
