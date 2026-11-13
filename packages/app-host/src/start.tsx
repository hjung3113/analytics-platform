import { createElement, StrictMode, useMemo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBasePathLocation, I18nProvider, type PlatformLocation, type PlatformSlots, type Registry } from '@ap/kernel';
import { GlobalContextBar, OpenInBoardAction } from '@ap/shell';
import { AppRoot } from './app-root';
import { buildRegistry } from './build-registry';
import { StartupBoundary, startOrFail } from './startup-failure';
import type { HostAssembly, StartAppHostOptions } from './types';

/**
 * Builds the Registry from the injected declarations, asks `createAssembly` for the outcome and mounts it into `container`:
 * `{ redirect }` calls `redirect` once and renders nothing, `{ screen }` renders the node without `PlatformProvider`, an assembly is
 * mounted as `<StrictMode><I18nProvider><AppRoot/></I18nProvider></StrictMode>`. A throw in any step renders `StartupFailure`, and so does a later
 * render throw that no inner boundary contains (`StartupBoundary`, #1876).
 * The Host merges three generic slots (`contextBar`, `boardEntry`, `topBarTools`) under the caller's `slots`.
 */
export async function startAppHost<A extends HostAssembly = HostAssembly>(options: StartAppHostOptions<A>): Promise<void> {
  const root = createRoot(options.container);
  await startOrFail(root, async () => {
    const registry = buildRegistry(options.declarations);
    const outcome = await Promise.resolve(options.createAssembly({ registry }));
    if ('redirect' in outcome) {
      (options.redirect ?? ((url: string) => window.location.replace(url)))(outcome.redirect);
      return;
    }
    if ('screen' in outcome) {
      root.render(<StrictMode><StartupBoundary>{outcome.screen}</StartupBoundary></StrictMode>);
      return;
    }
    const assembly = outcome;
    options.onAssembly?.(assembly, registry);
    const base = options.basePath;
    const location = base === undefined || base === '/' ? undefined : createBasePathLocation(base);
    root.render(
      <StrictMode>
        <StartupBoundary>
          <I18nProvider>
            <HostRoot options={options} assembly={assembly} registry={registry} location={location} />
          </I18nProvider>
        </StartupBoundary>
      </StrictMode>,
    );
  });
}

/**
 * Renders `AppRoot` with the merged slots. `options.slots` runs in this component's render on every render, so it may use React hooks
 * (keep the hook order fixed) and an assembler whose slots depend on a store returns the current slots; the three generic defaults are
 * built once per assembly and sit under the caller's slots.
 */
function HostRoot<A extends HostAssembly>({ options, assembly, registry, location }: { options: StartAppHostOptions<A>; assembly: A; registry: Registry; location: PlatformLocation | undefined }): ReactNode {
  const defaults = useMemo<PlatformSlots>(() => ({ contextBar: createElement(GlobalContextBar), boardEntry: createElement(OpenInBoardAction), topBarTools: assembly.topBarTools }), [assembly]);
  const slots: PlatformSlots = { ...defaults, ...options.slots?.(assembly) };
  return (
    <AppRoot assembly={assembly} registry={registry} queryHistory={options.queryHistory} location={location} slots={slots} spaceIdMigrations={options.spaceIdMigrations} equipmentAxes={options.equipmentAxes}>
      {options.children?.(assembly)}
    </AppRoot>
  );
}
