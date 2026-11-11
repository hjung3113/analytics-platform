import type { ReactNode } from 'react';
import type { PlatformAdapter, QueryHistoryStore, EquipmentAxisDescriptor, SavedViewStore } from '@ap/contracts';
import type { PlatformSlots, Registry } from '@ap/kernel';
import type { CreateRegistryInput } from './build-registry';

/** Where an assembly declares which of its endpoint ids a write affects (#1106): the Host mounts one bridge that refreshes exactly those. */
export type EndpointInvalidationSource = { subscribe: (listener: (endpointIds: readonly string[]) => void) => () => void };

/**
 * What an assembly hands the Host: the server adapter and its top-bar tools (`null` when there are none). `savedViews` is the saved-view
 * store (browser-local or server-backed); `serverPreferences: true` keeps the user's preferences on the server through the adapter's
 * preference ports (ADR-0098); `invalidation` is `EndpointInvalidationSource`. Domain-free: an app extends this type with what only it reads.
 */
export type HostAssembly = { adapter: PlatformAdapter; topBarTools: ReactNode; savedViews?: SavedViewStore; serverPreferences?: boolean; invalidation?: EndpointInvalidationSource };

/** What `createAssembly` may answer: the assembly to mount, a `redirect` target (login), or a `screen` rendered instead of the app (no Kernel, no shell). */
export type HostAssemblyOutcome = HostAssembly | { redirect: string } | { screen: ReactNode };

/** Receives the built Registry; synchronous in mock builds, the real assembly awaits its bootstrap. */
export type CreateHostAssembly = (o: { registry: Registry }) => HostAssemblyOutcome | Promise<HostAssemblyOutcome>;

/** Options of `startAppHost`. Everything that differs per installation is injected here; the Host imports no menu, space, mock or server client. */
export type StartAppHostOptions<A extends HostAssembly = HostAssembly> = {
  /** Mount point; the Host owns the React root created on it. */
  container: HTMLElement;
  /** The whole `createRegistry` input (spaces, groups, menus, permissions, carrySets, platformHomeMenuId, reservedRoots). */
  declarations: CreateRegistryInput;
  createAssembly: (o: { registry: Registry }) => A | { redirect: string } | { screen: ReactNode } | Promise<A | { redirect: string } | { screen: ReactNode }>;
  /** Base path of a sub-path deployment (e.g. Vite's `BASE_URL`); `'/'` or absent keeps the browser location. */
  basePath?: string;
  /** Old space id → current space id (ADR-0093). */
  spaceIdMigrations?: Readonly<Record<string, string>>;
  equipmentAxes: readonly EquipmentAxisDescriptor[];
  queryHistory: QueryHistoryStore;
  /** App slots; the Host puts `contextBar`, `boardEntry` and `topBarTools` UNDER these, so an injected value wins. Called on every render of the root. */
  slots?: (assembly: A) => PlatformSlots;
  /** Runs once after the Registry and the assembly exist and before the first render (the app wires its feature API and slot joins here). */
  onAssembly?: (assembly: A, registry: Registry) => void;
  /** Called once for a `{ redirect }` outcome; defaults to `window.location.replace`. */
  redirect?: (url: string) => void;
  /** Provider children mounted inside `PlatformProvider`, next to the shell (the app's session bridges). */
  children?: (assembly: A) => ReactNode;
};
