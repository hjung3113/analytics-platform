// Mock half of the sample read: the kit's mock assembly registers this list. Pages never import it.
// The server half is the in-house data server's (ADR-0146); this file is not shipped to production.
import { defineMockEndpoint, type AnyMockEndpoint } from '@ap/mock-server';
import { sampleEndpoint } from './endpoints';
import { MENU_ID } from './menu';

export const mockEndpoints: readonly AnyMockEndpoint[] = [
  defineMockEndpoint(sampleEndpoint, {
    mart: false,
    handle: () => [
      { name: `${MENU_ID} row A`, value: 1 },
      { name: `${MENU_ID} row B`, value: 2 },
    ],
  }),
];
