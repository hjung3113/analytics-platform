/** @ap/menu-access — access group. Scaffold: one sample query endpoint, no domain data. */
import { defineEndpoint } from '@ap/contracts';

/** What the sample mock handler returns today; replace with the real data shape. */
export type SampleData = { ready: true };

export const sampleEndpoint = defineEndpoint<Record<never, true>, SampleData>({
  id: 'access.sample',
  menuId: 'access-scaffold',
  paramKeys: {},
  permission: 'platform:view',
  requiresScope: false,
  context: {},
  kinds: [],
  mergeTimeDomain: false,
});
