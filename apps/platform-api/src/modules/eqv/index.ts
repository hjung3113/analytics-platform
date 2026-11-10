import type { Db } from '../../db/client.js';
import type { MenuDispatchContribution } from '../menu-dispatch/types.js';
import type { KnowledgeLookup } from '../log-knowledge/index.js';
import { eqvActions } from './actions.js';
import type { EqvDeps } from './authorize.js';
import { eqvEndpoints } from './endpoints.js';
import { EQV_MENU_PERMISSIONS } from './menu.js';
import { onboardingActions } from './onboarding-actions.js';
import { onboardingEndpoints } from './onboarding-endpoints.js';

export { EQV_FOCUS_MENU_ID, EQV_ONBOARDING_MENU_ID, EQV_STUDIO_MENU_ID } from './menu.js';

export interface EqvContributionDeps extends EqvDeps {
  db: Db;
  /** The Hub model read port: vendor and model of an equipment, judged for the acting person (#1658). */
  knowledgeLookup: Pick<KnowledgeLookup, 'getModel'>;
}

/** Layout, Template, equipment-option (#1645) and Onboarding (#1658) declarations for the menu-dispatch registry. */
export function eqvContribution(deps: EqvContributionDeps): MenuDispatchContribution {
  return { endpoints: [...eqvEndpoints(deps), ...onboardingEndpoints(deps)], actions: [...eqvActions(deps), ...onboardingActions(deps)], permissions: EQV_MENU_PERMISSIONS };
}
