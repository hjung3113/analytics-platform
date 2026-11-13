import { defineConfig } from 'vitest/config';
// Real instants (Trust times, audit times) render in the viewer's zone: pin it so a local run and CI read the same digits.
process.env.TZ = 'Asia/Seoul';
export default defineConfig({ test: { environment: 'jsdom', setupFiles: ['./src/test-setup.ts'] } });
