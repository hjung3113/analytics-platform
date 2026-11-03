/** @ap/menu-systems — systems group. Scaffold: one sample query endpoint, no domain data. */
import { defineEndpoint } from '@ap/contracts';

/** What the sample mock handler returns today; replace with the real data shape. */
export type SampleData = { ready: true };

export const sampleEndpoint = defineEndpoint<Record<never, true>, SampleData>({
  id: 'systems.sample',
  menuId: 'systems',
  paramKeys: {},
  permission: 'platform:view',
  requiresScope: false,
  context: {},
  kinds: [],
  mergeTimeDomain: false,
});
