import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';
import { defineConfig } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';
import { menuDeclarationSnapshotPlugin } from '@ap/contracts/build';

const kitRoot = fileURLToPath(new URL('.', import.meta.url));
const sdkVersion = () => (JSON.parse(readFileSync(new URL('./node_modules/@ap/contracts/package.json', import.meta.url), 'utf8')) as { version: string }).version;

/** The real build also writes dist/menu-declarations.snapshot.json — the menu declarations the core server checks the declaration bundle against. */
const menuDeclarationSnapshot = () => menuDeclarationSnapshotPlugin({
  registry: `${kitRoot}menus.ts`,
  // Every menu package's endpoints.ts (README «둘째 메뉴»: a copied folder is picked up without editing this file).
  declarationModules: readdirSync(`${kitRoot}menus`).sort().map((menu) => `${kitRoot}menus/${menu}/endpoints.ts`).filter((path) => existsSync(path)),
  sdkVersion: sdkVersion(),
  load: async (path) => (await runnerImport<Record<string, unknown>>(path, { configFile: false, root: kitRoot, logLevel: 'error' })).module,
});

export default defineConfig(({ mode }) => ({
  resolve: { alias: { '#kit-assembly': fileURLToPath(new URL(mode === 'real' ? './real/assembly.tsx' : './mock/assembly.ts', import.meta.url)) } },
  plugins: [tailwindcss(), ...(mode === 'real' ? [menuDeclarationSnapshot()] : [])],
  test: { environment: 'jsdom', include: ['src/**/*.test.tsx', 'real/**/*.test.tsx'] },
}));
