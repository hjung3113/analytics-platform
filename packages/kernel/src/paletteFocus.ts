export type PaletteSession = {
  opener: HTMLElement | null;
  select: () => void;
  isSelecting: () => boolean;
  isCurrent: () => boolean;
  claim: (owner: symbol) => void;
  release: (owner: symbol) => void;
};

/** Owns Dialog generations and instances; page navigation sees only a blocking gate. */
export function createPaletteFocus(page: { cancel: () => void; notify: () => void }) {
  let generation = 0;
  let open = false;
  let session: PaletteSession | null = null;
  let block: { generation: number; owner: symbol | null; rendered: boolean } | null = null;
  const release = (current: number, owner: symbol | null) => {
    if (block?.generation !== current || (block.owner !== null && block.owner !== owner)) return;
    block = null;
    page.notify();
  };
  return {
    isBlocked: () => block !== null,
    setOpen(nextOpen: boolean, opener: HTMLElement | null): PaletteSession | null {
      if (nextOpen && !open) {
        const current = ++generation;
        // Reopening cancels the previous selection, including a lazy destination.
        page.cancel();
        block = { generation: current, owner: null, rendered: false };
        let selecting = false;
        session = {
          opener,
          select: () => { selecting = true; },
          isSelecting: () => selecting,
          isCurrent: () => current === generation && !open,
          claim(owner) {
            if (current !== generation) return;
            block = { generation: current, owner, rendered: true };
          },
          release: owner => release(current, owner),
        };
      }
      open = nextOpen;
      return session;
    },
    // A batched open/close can finish without ever mounting Dialog's FocusScope.
    releaseUnrendered() {
      if (!open && block?.owner === null && !block.rendered) release(block.generation, null);
    },
    // Provider session disposal owns every instance in the invalidated generation.
    reset() {
      if (block) release(block.generation, block.owner);
      generation += 1;
      open = false;
      session = null;
    },
  };
}
