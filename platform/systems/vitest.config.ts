import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Feature sources reached through @ap/feature-screens/global-screens import themselves with the `@/` alias.
const FEATURE_SRC = fileURLToPath(new URL('../../apps/feature-screens/src', import.meta.url));

export default defineConfig({ resolve: { alias: { '@': FEATURE_SRC } }, test: { environment: 'jsdom' } });
