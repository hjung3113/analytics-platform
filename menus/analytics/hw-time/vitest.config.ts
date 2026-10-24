import { defineConfig } from 'vitest/config';

// The request-count and table tests drive many layout/rail/option steps in jsdom; alone they take ~2.5 s, but under the
// parallel CI load they passed the 5 s default and failed unrelated PRs (#769). 15 s keeps a real hang visible.
export default defineConfig({ test: { environment: 'node', testTimeout: 15_000 } });
