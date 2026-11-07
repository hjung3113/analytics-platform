// Dev/test assembly of the log-explorer module: injects the synthetic Source adapter. Production never imports this file
// (`modules/log-explorer/__tests__/production-graph.test.ts`).
import { createLogExplorerModule, type LogExplorerDeps, type LogExplorerModule, type SourceOwnerAccess } from '../modules/log-explorer/index.js';
import { createSyntheticScenario, type SyntheticScenario } from '../modules/log-explorer/adapters/synthetic/index.js';
import type { BuildServerOptions } from '../server.js';

export function createDevLogExplorerModule(deps: Omit<LogExplorerDeps, 'sourceReadPort'>): LogExplorerModule {
  return createLogExplorerModule({ ...deps, sourceReadPort: createSyntheticScenario('typical').port });
}

/**
 * `buildServer` options of the dev/test server: the synthetic Source adapter of one scenario and the rule that says which Source
 * owners an actor may read. Production passes neither (`BuildServerOptions.logExplorer`).
 */
export function devLogExplorerServerOptions(
  access: SourceOwnerAccess,
  scenario: SyntheticScenario = 'typical',
): NonNullable<BuildServerOptions['logExplorer']> {
  return { sourceReadPort: createSyntheticScenario(scenario).port, sourceOwnerAccess: access };
}
