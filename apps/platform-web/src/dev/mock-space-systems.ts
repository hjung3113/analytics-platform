import type { SpaceSystems } from '../space-systems';

/**
 * Mock data of the space → Managed System links (#1289 node j), the same shape the real server answers: one declared link per space with
 * `feedbackTracking: true` (the spaces `platform-systems.json` lists), plus a 「플랫폼」 system. A new `feedbackTracking` space adds its row here
 * (`feature-systems.test.ts` names a missing one, #1905). Synthetic values; the real deployment's come from the core server (`GET /managed-systems/space-links`).
 */
export const MOCK_SPACE_SYSTEMS: SpaceSystems = {
  links: [
    { spaceId: 'mars', managedSystemId: '4f1b2c3d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', declared: true },
    { spaceId: 'bravo', managedSystemId: '7a8b9c0d-1e2f-4a3b-9c4d-5e6f7a8b9c0d', declared: true },
    { spaceId: 'clas', managedSystemId: '9c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f', declared: true },
    { spaceId: 'log-dev', managedSystemId: '5e6f7a8b-9c0d-4e1f-a2b3-c4d5e6f7a8b9', declared: true },
  ],
  platformManagedSystemId: '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a',
};
