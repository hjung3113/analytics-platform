import type { MenuDispatchContribution } from '../menu-dispatch/types.js';
import { catalogEndpoints } from './catalog-endpoints.js';
import { coverageEndpoints } from './coverage-endpoints.js';
import type { LogRulesContributionDeps } from './deps.js';

/** The catalog and coverage reads for the Menu Dispatch registry. No actions: the only write is the token-only report REST. */
export function logRulesContribution(deps: LogRulesContributionDeps): MenuDispatchContribution {
  return { endpoints: [...catalogEndpoints(deps), ...coverageEndpoints(deps)], actions: [] };
}
