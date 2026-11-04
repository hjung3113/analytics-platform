// In-process admission of the heavy import work (#1195 b3): at most two parses and at most two apply runs at a time
// per process, shared by the HTTP routes and the menu actions. A caller that finds no free slot is told to retry at
// once; nobody waits while holding a transaction or a pool connection.

export interface Slots {
  /** Takes a slot, or `null` when all are busy. The returned function gives it back (idempotent). */
  tryTake(): (() => void) | null;
}

export function createSlots(max: number): Slots {
  let taken = 0;
  return {
    tryTake() {
      if (taken >= max) return null;
      taken += 1;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        taken -= 1;
      };
    },
  };
}

export const IMPORT_PARSE_CONCURRENCY = 2;
export const IMPORT_APPLY_CONCURRENCY = 2;

/** One per process: the upload route and `importPaste` share it. */
export const parseSlots = createSlots(IMPORT_PARSE_CONCURRENCY);
/** One per process: the apply route and `importApply` share it. */
export const applySlots = createSlots(IMPORT_APPLY_CONCURRENCY);
