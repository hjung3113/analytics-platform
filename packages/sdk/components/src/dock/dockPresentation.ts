/** Internal native engine presentation. Module constants keep theme/options identity across renders. */
const reducedTheme = {
  name: 'ap', className: 'ap-dock', gap: 6,
  dndOverlayBorder: '2px solid var(--color-accent-primary)',
  dndTabIndicator: 'line' as const,
  dndPanelOverlay: 'group' as const,
};
const animatedTheme = { ...reducedTheme, tabAnimation: 'smooth' as const };
export const dockTheme = (reducedMotion: boolean) => reducedMotion ? reducedTheme : animatedTheme;
export const dockDndEdges = { size: { type: 'percentage' as const, value: 50 }, activationSize: { type: 'pixels' as const, value: 30 } };
const contentOverlay = { size: { type: 'percentage' as const, value: 50 }, smallWidthBoundary: 0, smallHeightBoundary: 0 };
export const dockDropOverlayModel = ({ location }: { location: string }) => location === 'content' ? contentOverlay : undefined;

/** px: the drop strip under the last row of a stacked workspace (72 high + its `mt-2`). It is not in the DOM when rows are first measured, so the one-row height reserves it. */
export const DOCK_DROP_STRIP_CHROME = 80;
