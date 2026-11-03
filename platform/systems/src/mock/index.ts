/** Mock server half of the sample endpoint (@ap/menu-systems, #126). The app composition
 * root registers this list via '@ap/menu-systems/mock' → createMockAdapter({ endpoints, registry });
 * pages never import this module. */
import { defineMockEndpoint, type AnyMockEndpoint } from '@ap/mock-server';
import { sampleEndpoint } from '../endpoints';

export const systemsMock: readonly AnyMockEndpoint[] = [
  defineMockEndpoint(sampleEndpoint, { handle: () => ({ ready: true }) }),
];
