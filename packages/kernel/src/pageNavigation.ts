export type PageFocus = 'drill' | 'return';

/** Provider-owned handoff: only explicit navigation owns a focus request.
 * Kernel default writes belong to that same generation, even during a slow lazy load.
 */
export function createPageNavigation(initialUrl: string) {
  let generation = 0;
  let url = initialUrl;
  let pending: { generation: number; path: string; focus: PageFocus } | null = null;
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
    consume(path: string): PageFocus | null {
      const request = pending;
      pending = null;
      return request?.generation === generation && request.path === path ? request.focus : null;
    },
  };
}
export type PageNavigation = Pick<ReturnType<typeof createPageNavigation>, 'requestReturn' | 'consume'>;
