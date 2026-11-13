import type { ReactNode } from 'react';
import type { EquipmentAxisDescriptor, QueryHistoryStore } from '@ap/contracts';
import { PlatformProvider, type PlatformLocation, type PlatformSlots, type Registry } from '@ap/kernel';
import { AppShell, RouteOutlet } from '@ap/shell';
import { EndpointInvalidationBridge } from './endpoint-invalidation-bridge';
import type { HostAssembly } from './types';

/**
 * The mounted app under `I18nProvider`: `PlatformProvider` built from the injected values, then the invalidation bridge, the caller's
 * `children`, and `<AppShell productName={productName}><RouteOutlet /></AppShell>`. `slots` is a ready object; a caller that rebuilds it re-renders the shell through
 * the provider's context (the Host subscribes to no store of its own).
 */
export function AppRoot({ assembly, registry, queryHistory, location, slots, spaceIdMigrations, equipmentAxes, productName, children }: {
  assembly: HostAssembly;
  registry: Registry;
  queryHistory: QueryHistoryStore;
  location: PlatformLocation | undefined;
  slots: PlatformSlots;
  spaceIdMigrations?: Readonly<Record<string, string>>;
  equipmentAxes: readonly EquipmentAxisDescriptor[];
  productName?: string;
  children?: ReactNode;
}) {
  return (
    <PlatformProvider serverPreferences={assembly.serverPreferences} spaceIdMigrations={spaceIdMigrations} queryHistory={queryHistory} savedViews={assembly.savedViews} equipmentAxes={equipmentAxes} adapter={assembly.adapter} registry={registry} location={location} slots={slots}>
      {children}
      {assembly.invalidation && <EndpointInvalidationBridge source={assembly.invalidation} />}
      <AppShell productName={productName}><RouteOutlet /></AppShell>
    </PlatformProvider>
  );
}
