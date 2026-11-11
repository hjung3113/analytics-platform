import { equipmentOptions, eqvMockContext, eqvMockEquipmentOptions, eqvMockEvents, topviewContext, topviewEvents } from '@ap/menu-topview/mock-data';
import { defineMockEndpoint, MockRequestError, type AnyMockEndpoint } from '@ap/mock-server';

/**
 * EV's endpoints answered from its synthetic fixture (`@ap/menu-topview/mock-data`; the dev assembly and the conformance
 * test are the only importers, lint and `check:prod-graph` enforce it). Not a mart source.
 */
export const eqvMock: readonly AnyMockEndpoint[] = [
  defineMockEndpoint(equipmentOptions, {
    mart: false,
    handle: () => eqvMockEquipmentOptions(),
    isEmpty: data => data.options.length === 0,
  }),
  defineMockEndpoint(topviewContext, {
    mart: false,
    handle: ({ params }) => eqvMockContext(params.equipmentId),
  }),
  defineMockEndpoint(topviewEvents, {
    mart: false,
    handle: ({ context, params }) => {
      if (context.from === null || context.to === null) throw new MockRequestError('eqv.topview-events needs an applied time window');
      return eqvMockEvents({ equipmentId: params.equipmentId, from: context.from, to: context.to, continuationToken: params.continuationToken });
    },
    isEmpty: batch => batch.occurrences.length === 0,
  }),
];
