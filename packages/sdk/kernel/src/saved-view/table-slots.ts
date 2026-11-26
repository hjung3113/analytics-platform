import type { Text } from '../i18n';

// Inline NODE_ENV comparison so production builds drop the warning (#3028); typed locally as in context/drillValueLabel.ts.
declare const process: { env: { NODE_ENV?: string } };
type SaveBlock = string | Text;
const NO_SAVE_BLOCKS: readonly SaveBlock[] = [];
type Slot = { value: unknown; blocked?: SaveBlock | undefined; apply: (value: never) => void; accepts?: (value: never) => boolean; project?: (value: never) => unknown };
export type ViewSlots = ReturnType<typeof createScreenSlots>;
export const saveBlockKey = (reason: SaveBlock): string =>
  JSON.stringify(typeof reason === 'string' ? [reason, reason] : [reason.ko, reason.en]);

export function collectSaveBlocks(...screens: (ViewSlots | undefined)[]): readonly SaveBlock[] {
  const reasons = new Map<string, SaveBlock>();
  for (const screen of screens) for (const reason of screen?.saveBlocks() ?? []) {
    const key = saveBlockKey(reason);
    if (!reasons.has(key)) reasons.set(key, reason);
  }
  return reasons.size === 0 ? NO_SAVE_BLOCKS : [...reasons.values()];
}

function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left) !== Array.isArray(right)) return false;
  const a = Object.entries(left); const b = Object.entries(right);
  return a.length === b.length && a.every(([key, value]) => Object.hasOwn(right, key) && sameValue(value, (right as Record<string, unknown>)[key]));
}

/** Internal field/key mechanism: a typed host hook owns each field's validation and compatibility. */
function createScreenSlots() {
  const fields = new Map<string, Map<string, Slot[]>>();
  const listeners = new Set<() => void>();
  let revision = 0;
  let applied: { token: object; viewId: string; fields: Record<string, Record<string, unknown> | undefined>; consumed: Set<string> } | null = null;
  const emit = () => { revision += 1; listeners.forEach(listener => listener()); };
  const applyKey = (field: string, key: string) => {
    if (!applied) return;
    const tokenKey = JSON.stringify([field, key]);
    const entries = fields.get(field)?.get(key);
    const values = applied.fields[field];
    if (!entries?.length || !values || !Object.hasOwn(values, key) || applied.consumed.has(tokenKey)) return;
    const accepted = entries.filter(entry => !entry.accepts || entry.accepts(values[key] as never));
    if (!accepted.length) return;
    applied.consumed.add(tokenKey);
    for (const entry of accepted) entry.apply(values[key] as never);
  };
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    snapshot: () => revision,
    changed: emit,
    retry(field: string, key: string) { applyKey(field, key); emit(); },
    register<T>(field: string, key: string, slot: { value: T; blocked?: SaveBlock | undefined; apply: (value: T) => void; accepts?: (value: T) => boolean; project?: (value: T) => T; single?: boolean }) {
      let keys = fields.get(field);
      if (!keys) { keys = new Map(); fields.set(field, keys); }
      const entry = slot as Slot;
      const previous = keys.get(key) ?? [];
      if (process.env.NODE_ENV !== 'production' && slot.single && previous.length > 0) {
        console.warn(`Saved view slot "${field}" accepts one registration per screen.`);
      }
      keys.set(key, [...previous, entry]);
      emit(); applyKey(field, key);
      return () => {
        const rest = (keys.get(key) ?? []).filter(item => item !== entry);
        if (rest.length) keys.set(key, rest); else keys.delete(key);
        emit();
      };
    },
    *saveBlocks(): Iterable<SaveBlock> {
      for (const keys of fields.values()) for (const entries of keys.values()) for (const entry of entries) {
        const reason = entry.blocked;
        if (reason !== undefined) yield reason;
      }
    },
    capture<T>(field: string): Record<string, T> {
      return Object.fromEntries([...(fields.get(field) ?? [])].flatMap(([key, entries]) => {
        const entry = entries.at(-1);
        return entry ? [[key, entry.value as T]] : [];
      }));
    },
    differs(field: string, saved: Record<string, unknown> | undefined): boolean {
      if (!saved) return false;
      return [...(fields.get(field) ?? [])].some(([key, entries]) => {
        const entry = entries.at(-1);
        return entry !== undefined && Object.hasOwn(saved, key) && (!entry.accepts || entry.accepts(saved[key] as never)) && !sameValue(entry.value, entry.project ? entry.project(saved[key] as never) : saved[key]);
      });
    },
    apply(viewId: string, values: Record<string, Record<string, unknown> | undefined>) {
      applied = { token: {}, viewId, fields: values, consumed: new Set() };
      for (const [field, keys] of fields) for (const key of keys.keys()) applyKey(field, key);
    },
    /**
     * Re-entry and the personal default: deliver a view's values once. For the view already applied, only fields it did not carry yet are
     * added, so a re-entry restore and a default apply of the same view, in either order, reach each slot once. A pick uses `apply`.
     */
    restore(viewId: string, values: Record<string, Record<string, unknown> | undefined>) {
      if (applied?.viewId !== viewId) { this.apply(viewId, values); return; }
      const current = applied;
      for (const [field, value] of Object.entries(values)) {
        if (Object.hasOwn(current.fields, field)) continue;
        current.fields[field] = value;
        for (const key of fields.get(field)?.keys() ?? []) applyKey(field, key);
      }
    },
    select(viewId: string | null) { if (applied?.viewId !== viewId) applied = null; },
  };
}
export function createViewSlotStore(generation?: string | object) {
  const screens = new Map<string, ViewSlots>();
  return { generation, screen(key: string) {
    let slots = screens.get(key);
    if (!slots) { slots = createScreenSlots(); screens.set(key, slots); }
    return slots;
  } };
}
