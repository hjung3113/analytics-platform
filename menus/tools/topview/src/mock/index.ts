/** Mock server half of the viewer menu package (@ap/menu-topview): EV's three reads answered from its synthetic fixture, `mart: false`
 * (not a mart source). The app's mock assembly registers `topviewMock` (the one `pnpm gen:menu` marker of the package) and hands the fixture
 * in with `setTopviewMockSource` (`@ap/menu-topview/mock-data`), because mock code may not import `@eqv/core` or the package's fixture internals;
 * pages never import this module. */
import { defineMockEndpoint, MockRequestError, type AnyMockEndpoint } from '@ap/mock-server';
import { equipmentOptions, topviewContext, topviewEvents, type EquipmentOptions, type TopviewContextData, type TopviewEventsData } from '../endpoints';

/** The synthetic fixture the three reads answer from (the `eqvMock*` functions of `@ap/menu-topview/mock-data`). */
export type TopviewMockSource = {
  equipmentOptions(): EquipmentOptions;
  context(equipmentId: string): TopviewContextData;
  events(params: { equipmentId: string; from: string; to: string; continuationToken?: string }): TopviewEventsData;
};

let source: TopviewMockSource | null = null;
export function setTopviewMockSource(next: TopviewMockSource): void { source = next; }
const fixture = (): TopviewMockSource => {
  if (source === null) throw new Error('setTopviewMockSource was not called');
  return source;
};

export const topviewMock: readonly AnyMockEndpoint[] = [
  defineMockEndpoint(equipmentOptions, {
    mart: false,
    handle: () => fixture().equipmentOptions(),
    isEmpty: data => data.options.length === 0,
  }),
  defineMockEndpoint(topviewContext, {
    mart: false,
    handle: ({ params }) => fixture().context(params.equipmentId),
  }),
  defineMockEndpoint(topviewEvents, {
    mart: false,
    handle: ({ context, params }) => {
      if (context.from === null || context.to === null) throw new MockRequestError('eqv.topview-events needs an applied time window');
      return fixture().events({ equipmentId: params.equipmentId, from: context.from, to: context.to, continuationToken: params.continuationToken });
    },
    isEmpty: batch => batch.occurrences.length === 0,
  }),
];
