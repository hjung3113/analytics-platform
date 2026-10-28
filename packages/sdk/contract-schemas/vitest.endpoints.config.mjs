import { defineConfig } from 'vitest/config';

// Reads every menu's src/endpoints.ts through Vite (the files import './permission' and '@ap/contracts', which Node cannot
// resolve). Kept apart from `test` so turbo's cache for this package never hides a menu edit; the gate is tooling/sdk/sdk-schemas.test.mjs.
export default defineConfig({ test: { include: ['scripts/endpoints.vitest.mjs'] } });
