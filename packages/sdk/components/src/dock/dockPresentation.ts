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
