export type PageFocus = 'drill' | 'return' | 'page';

/** Provider-owned handoff: only explicit navigation owns a focus request.
 * Kernel default writes belong to that same generation, even during a slow lazy load.
 */
export function createPageNavigation(initialUrl: string) {
  let generation = 0;
  let url = initialUrl;
  let pending: { generation: number; path: string; focus: PageFocus } | null = null;
  let paletteGeneration = 0;
  let pageFocusBlock: { generation: number; owner: symbol | null; rendered: boolean } | null = null;
  const listeners = new Set<() => void>();
  const pathOf = (href: string) => href.split('?')[0];
  return {
    advance(next: string, focus?: PageFocus) {
      generation += 1;
      url = next;
      pending = focus ? { generation, path: pathOf(next), focus } : null;
    },
    materialize(next: string) {
      if (pathOf(next) !== pathOf(url)) { generation += 1; pending = null; }
      url = next;
    },
    requestReturn(href: string) {
      pending = href === url ? { generation, path: pathOf(href), focus: 'return' } : null;
    },
    cancel() { pending = null; },
    // Reopening the palette cancels a previous selection, including a lazy destination.
    blockPageFocus(nextPaletteGeneration: number) {
      pending = null;
      paletteGeneration = nextPaletteGeneration;
      pageFocusBlock = { generation: paletteGeneration, owner: null, rendered: false };
    },
    // The current Dialog session releases only after FocusScope unmount cleanup.
    claimPaletteFocus(generation: number, owner: symbol) {
      if (generation !== paletteGeneration) return;
      pageFocusBlock = { generation, owner, rendered: true };
    },
    releaseUnrenderedPageFocus(paletteGeneration: number) {
      if (pageFocusBlock?.generation === paletteGeneration && pageFocusBlock.owner === null && !pageFocusBlock.rendered) this.releasePageFocus(paletteGeneration, null);
    },
    releasePageFocus(paletteGeneration: number, owner: symbol | null) {
      if (pageFocusBlock?.generation !== paletteGeneration || (pageFocusBlock.owner !== null && pageFocusBlock.owner !== owner)) return;
      pageFocusBlock = null;
      listeners.forEach(listener => listener());
    },
    // Provider session disposal owns every instance in the invalidated generation.
    resetPaletteFocus(generation: number) {
      if (generation !== paletteGeneration) return;
      if (pageFocusBlock) this.releasePageFocus(generation, pageFocusBlock.owner);
      paletteGeneration += 1;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    consume(path: string): PageFocus | null {
      if (pending?.focus === 'page' && pageFocusBlock) return null;
      const request = pending;
      pending = null;
      return request?.generation === generation && request.path === path ? request.focus : null;
    },
  };
}
export type PageNavigation = Pick<ReturnType<typeof createPageNavigation>, 'requestReturn' | 'consume' | 'releasePageFocus' | 'claimPaletteFocus' | 'subscribe'>;
