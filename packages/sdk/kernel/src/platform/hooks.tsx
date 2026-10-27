import { use, useContext, useMemo } from 'react';
import type { PortCache } from '../scope/selection-port-cache';
import type { QueryEngine } from '../query/query-engine';
import type { EquipmentAxisDescriptor, UsageVia } from '@ap/contracts';
import type { HostPlatform, MenuPlatform, Recent, Toast } from './types';
import { AppContext, MainBoundContext, OverlayContext, PaneScreenContext, RecentContext, ScreenContext, ToastsContext, type OverlayState } from './contexts';

function useMerged(): HostPlatform | null {
  const app = useContext(AppContext);
  const main = useContext(MainBoundContext);
  const paneScreen = useContext(PaneScreenContext);
  // `use` reads the main screen only outside a pane, so a pane reader has no dependency on it.
  const screen = paneScreen ?? use(ScreenContext);
  return useMemo(() => (app && main && screen ? { ...app.pub, ...main, ...screen } : null), [app, main, screen]);
}

/** Recent visits of the main screen, newest first. For a rendered list; an event handler reads `readRecent()` (host). Throws outside a provider. */
export function useRecentVisits(): readonly Recent[] {
  const value = useContext(RecentContext);
  if (value === null) throw new Error('useRecentVisits outside PlatformProvider');
  return value;
}

/** The shell toast list (`@ap/kernel/host`). Raising and dismissing stay `toast`/`dismissToast`. Throws outside a provider. */
export function useToastList(): readonly Toast[] {
  const value = useContext(ToastsContext);
  if (value === null) throw new Error('useToastList outside PlatformProvider');
  return value;
}

/** Open state and focus-gate sessions of the command palette and the system switcher (`@ap/kernel/host`). Throws outside a provider. */
export function useOverlayState(): OverlayState {
  const value = useContext(OverlayContext);
  if (value === null) throw new Error('useOverlayState outside PlatformProvider');
  return value;
}

/** The menu contract (ADR-0076). The same runtime value as `useHostPlatform()`, typed down to `MenuPlatform`. */
export function usePlatform(): MenuPlatform {
  return useHostPlatform();
}

/** Provider value, or null where there is no provider. Always a hook call — never try/catch. */
export function usePlatformOptional(): MenuPlatform | null {
  return useMerged();
}

/** The full platform value for the shell, the platform components and the app (`@ap/kernel/host`, ADR-0076). Menus use `usePlatform()`. */
export function useHostPlatform(): HostPlatform {
  const value = useMerged();
  if (!value) throw new Error('usePlatform outside PlatformProvider');
  return value;
}

/** `useHostPlatform()`, or null where there is no provider. Always a hook call — never try/catch. */
export function useHostPlatformOptional(): HostPlatform | null {
  return useMerged();
}

/** Anchor that navigates through the kernel (keeps modifier-click/open-in-new-tab behavior). */
export function PlatformLink({ href, children, className, onNavigate, via, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; onNavigate?: () => void; /** How this link is reported in the usage entry it leads to (default `link`). */ via?: UsageVia }) {
  const { navigate, location, pathname } = usePlatform();
  return <a href={location.href(href)} className={className} {...rest} onClick={e => {
    rest.onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const focus = href.split('?')[0] !== pathname ? { focus: 'page' as const } : undefined;
    if (navigate(href, via ? { ...focus, via } : focus)) onNavigate?.();
  }}>{children}</a>;
}

/** App-supplied axes; an omitted prop deliberately supports no Condition axes. */
export function useEquipmentAxes(): readonly EquipmentAxisDescriptor[] {
  const app = useContext(AppContext);
  if (!app) throw new Error('useEquipmentAxes outside PlatformProvider');
  return app.pub.equipmentAxes;
}

/** The Kernel's internal query client and session generation (ADR-0086); intentionally absent from the SDK index. */
export function useQueryEngine(): QueryEngine {
  const app = useContext(AppContext);
  if (!app) throw new Error('Kernel queries outside PlatformProvider');
  return app.internal.queryEngine;
}

/** Internal screen request store; intentionally absent from the SDK index. */
export function useSelectionPortCache(): PortCache {
  const app = useContext(AppContext);
  if (!app) throw new Error('Selection ports outside PlatformProvider');
  return app.internal.selectionPortCache;
}
