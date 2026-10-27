// jsdom has no ResizeObserver and no geometry: the workspace (PanelWorkspace) needs a size to mount its panels, so every observed
// element reports 1200 × 700. Call the returned function to restore the previous global.
export function installWorkspaceGeometry(): () => void {
  class FakeResizeObserver {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(target: Element) {
      const rect = { width: 1200, height: 700, top: 0, left: 0, right: 1200, bottom: 700, x: 0, y: 0 };
      this.callback([{ target, contentRect: rect } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    unobserve() {}
    disconnect() {}
  }
  const previous = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = FakeResizeObserver;
  return () => { (globalThis as { ResizeObserver?: unknown }).ResizeObserver = previous; };
}
