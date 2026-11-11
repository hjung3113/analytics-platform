import { createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBasePathLocation, I18nProvider, type PlatformSlots } from '@ap/kernel';
import { GlobalContextBar, OpenInBoardAction } from '@ap/shell';
import { AppRoot } from './app-root';
import { buildRegistry } from './build-registry';
import { startOrFail } from './startup-failure';
import type { HostAssembly, StartAppHostOptions } from './types';

/**
 * Builds the Registry from the injected declarations, asks `createAssembly` for the outcome and mounts it into `container`:
 * `{ redirect }` calls `redirect` once and renders nothing, `{ screen }` renders the node without `PlatformProvider`, an assembly is
 * mounted as `<StrictMode><I18nProvider><AppRoot/></I18nProvider></StrictMode>`. A throw in any step renders `StartupFailure`.
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
      root.render(<StrictMode>{outcome.screen}</StrictMode>);
      return;
    }
    const assembly = outcome;
    options.onAssembly?.(assembly, registry);
    const base = options.basePath;
    const location = base === undefined || base === '/' ? undefined : createBasePathLocation(base);
    const slots: PlatformSlots = { contextBar: createElement(GlobalContextBar), boardEntry: createElement(OpenInBoardAction), topBarTools: assembly.topBarTools, ...options.slots?.(assembly) };
    root.render(
      <StrictMode>
        <I18nProvider>
          <AppRoot assembly={assembly} registry={registry} queryHistory={options.queryHistory} location={location} slots={slots} spaceIdMigrations={options.spaceIdMigrations} equipmentAxes={options.equipmentAxes}>
            {options.children?.(assembly)}
          </AppRoot>
        </I18nProvider>
      </StrictMode>,
    );
  });
}
