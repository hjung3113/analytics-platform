// Dev/test assembly of the log-explorer module: injects the synthetic Source adapter. Production never imports this file
// (`modules/log-explorer/__tests__/production-graph.test.ts`).
import { createLogExplorerModule, type LogExplorerDeps, type LogExplorerModule } from '../modules/log-explorer/index.js';
import { createSyntheticScenario } from '../modules/log-explorer/adapters/synthetic/index.js';

export function createDevLogExplorerModule(deps: Omit<LogExplorerDeps, 'sourceReadPort'>): LogExplorerModule {
  return createLogExplorerModule({ ...deps, sourceReadPort: createSyntheticScenario('typical').port });
}
