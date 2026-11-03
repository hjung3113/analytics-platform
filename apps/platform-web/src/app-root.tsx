import { useMemo, useSyncExternalStore } from 'react';
import type { QueryHistoryStore } from '@ap/contracts';
import { PlatformProvider, type PlatformLocation, type PlatformSlots } from '@ap/kernel';
import type { Assembly } from '#platform-assembly';
import { AppShell, RouteOutlet } from '@ap/shell';
import { EndpointInvalidationBridge } from './endpoint-invalidation-bridge';
import { EQUIPMENT_AXES } from './equipmentAxes';
import { registry, SPACE_ID_MIGRATIONS } from './menus';
import { spaceSystems } from './space-systems';
import { SpaceSystemsSession } from './space-systems-session';

/**
 * The mounted app under `I18nProvider` (`main.tsx` builds the slot objects and the assembly). The Kernel's feature slot is synchronous (ADR-0110 decision 5), so the app owns the
 * async part: this subscribes to the space → system store and rebuilds the slots whenever it completes, fails or refreshes. A new `slots` object re-renders the shell's sidebar through the
 * provider's context; the `vocCompose` slot object, and with it an open form and its draft, keeps its identity (`makeSlots` must reuse it).
 */
export function AppRoot({ assembly, queryHistory, location, makeSlots }: { assembly: Assembly; queryHistory: QueryHistoryStore; location: PlatformLocation | undefined; makeSlots: () => PlatformSlots }) {
  const links = useSyncExternalStore(spaceSystems.subscribe, spaceSystems.getSnapshot);
  const slots = useMemo(makeSlots, [makeSlots, links]);
  return (
    <PlatformProvider serverPreferences={assembly.serverPreferences} spaceIdMigrations={SPACE_ID_MIGRATIONS} queryHistory={queryHistory} savedViews={assembly.savedViews} equipmentAxes={EQUIPMENT_AXES} adapter={assembly.adapter} registry={registry} location={location} slots={slots}>
      <SpaceSystemsSession source={assembly.spaceSystems ?? null} />
      {assembly.invalidation && <EndpointInvalidationBridge source={assembly.invalidation} />}
      <AppShell><RouteOutlet /></AppShell>
    </PlatformProvider>
  );
}
