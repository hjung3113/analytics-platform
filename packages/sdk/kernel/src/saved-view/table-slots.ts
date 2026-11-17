type Slot = { value: unknown; apply: (value: never) => void; accepts?: (value: never) => boolean };
export type ViewSlots = ReturnType<typeof createScreenSlots>;
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
    applied.consumed.add(tokenKey);
    for (const entry of entries) if (!entry.accepts || entry.accepts(values[key] as never)) entry.apply(values[key] as never);
  };
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    snapshot: () => revision,
    changed: emit,
    register<T>(field: string, key: string, slot: { value: T; apply: (value: T) => void; accepts?: (value: T) => boolean }) {
      let keys = fields.get(field);
      if (!keys) { keys = new Map(); fields.set(field, keys); }
      const entry = slot as Slot;
      keys.set(key, [...(keys.get(key) ?? []), entry]);
      emit(); applyKey(field, key);
      return () => {
        const rest = (keys.get(key) ?? []).filter(item => item !== entry);
        if (rest.length) keys.set(key, rest); else keys.delete(key);
        emit();
      };
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
        return entry !== undefined && Object.hasOwn(saved, key) && (!entry.accepts || entry.accepts(saved[key] as never)) && !sameValue(entry.value, saved[key]);
      });
    },
    apply(viewId: string, values: Record<string, Record<string, unknown> | undefined>) {
      applied = { token: {}, viewId, fields: values, consumed: new Set() };
      for (const [field, keys] of fields) for (const key of keys.keys()) applyKey(field, key);
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
