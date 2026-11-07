import type { MenuDispatchContribution } from '../menu-dispatch/types.js';
import { catalogEndpoints } from './catalog-endpoints.js';
import type { LogRulesReadDeps } from './deps.js';

/** The catalog reads for the Menu Dispatch registry. No actions: the only write is the token-only report REST. */
export function logRulesContribution(deps: LogRulesReadDeps): MenuDispatchContribution {
  return { endpoints: catalogEndpoints(deps), actions: [] };
}
