import { describe, expect, it } from 'vitest';
import { dockTheme, dockDndEdges, dockDropOverlayModel } from './dockPresentation';

describe('native Dock presentation (#1141)', () => {
  it('keeps stable options and distinct center/tab and half-edge footprints', () => {
    expect(dockTheme(false)).toBe(dockTheme(false));
    expect(dockTheme(false)).toMatchObject({ dndOverlayBorder: '2px solid var(--color-accent-primary)', dndPanelOverlay: 'group', dndTabIndicator: 'line', tabAnimation: 'smooth' });
    expect(dockDndEdges).toEqual({ size: { type: 'percentage', value: 50 }, activationSize: { type: 'pixels', value: 30 } });
    expect(dockDropOverlayModel({ location: 'content' })).toEqual({ size: { type: 'percentage', value: 50 }, smallWidthBoundary: 0, smallHeightBoundary: 0 });
    expect(dockDropOverlayModel({ location: 'content' })).toBe(dockDropOverlayModel({ location: 'content' }));
    expect(dockDropOverlayModel({ location: 'tab' })).toBeUndefined();
  });
  it('omits smooth animation for reduced motion without changing drop geometry or object identity', () => {
    expect(dockTheme(true)).toBe(dockTheme(true));
    expect(dockTheme(true)).not.toHaveProperty('tabAnimation');
    expect({ ...dockTheme(true), tabAnimation: 'smooth' }).toEqual(dockTheme(false));
  });
});
