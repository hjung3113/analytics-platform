import { topviewContext, topviewEvents } from '@eqv/platform-adapter';
import { eqvMockContext, eqvMockEvents } from '@eqv/platform-adapter/mock-data';
import { defineMockEndpoint, MockRequestError, type AnyMockEndpoint } from '@ap/mock-server';

/**
 * EV's two endpoints answered from its synthetic fixture (`@eqv/platform-adapter/mock-data`; the dev assembly and the conformance
 * test are the only importers, lint and `check:prod-graph` enforce it). Not a mart source. The specs are copies with
 * `mergeTimeDomain: false`: the mock world has no `eq-synth-01`, and the engine would merge a time-domain assessment for every
 * equipment it holds under `requiresScope: false`. Mock only; the EV declaration is unchanged.
 */
export const eqvMock: readonly AnyMockEndpoint[] = [
  defineMockEndpoint({ ...topviewContext, mergeTimeDomain: false }, {
    mart: false,
    handle: ({ params }) => eqvMockContext(params.equipmentId),
  }),
  defineMockEndpoint({ ...topviewEvents, mergeTimeDomain: false }, {
    mart: false,
    handle: ({ context, params }) => {
      if (context.from === null || context.to === null) throw new MockRequestError('eqv.topview-events needs an applied time window');
      return eqvMockEvents({ equipmentId: params.equipmentId, from: context.from, to: context.to, continuationToken: params.continuationToken });
    },
    isEmpty: batch => batch.occurrences.length === 0,
  }),
];
