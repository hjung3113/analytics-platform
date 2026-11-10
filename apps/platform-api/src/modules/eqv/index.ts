import type { Db } from '../../db/client.js';
import type { MenuDispatchContribution } from '../menu-dispatch/types.js';
import { eqvActions } from './actions.js';
import type { EqvDeps } from './authorize.js';
import { eqvEndpoints } from './endpoints.js';

export { EQV_FOCUS_MENU_ID, EQV_STUDIO_MENU_ID } from './menu.js';

export interface EqvContributionDeps extends EqvDeps {
  db: Db;
}

/** Layout, Template and equipment-option declarations for the menu-dispatch registry (#1645). */
export function eqvContribution(deps: EqvContributionDeps): MenuDispatchContribution {
  return { endpoints: eqvEndpoints(deps), actions: eqvActions(deps) };
}
