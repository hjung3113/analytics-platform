import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => ({
  resolve: { alias: { '#kit-assembly': fileURLToPath(new URL(mode === 'real' ? './real/assembly.tsx' : './mock/assembly.ts', import.meta.url)) } },
  plugins: [tailwindcss()],
  test: { environment: 'jsdom', include: ['src/**/*.test.tsx', 'real/**/*.test.tsx'] },
}));
