import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// FeedbackOps sources reached through @fops/frontend/global-screens import themselves with the `@/` alias.
const FO_SRC = fileURLToPath(new URL('../../../apps/feature-screens/src', import.meta.url));

export default defineConfig({ resolve: { alias: { '@': FO_SRC } }, test: { environment: 'jsdom' } });
