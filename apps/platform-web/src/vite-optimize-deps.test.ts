// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import viteConfig from '../vite.config.ts';

// A bare `echarts/<x>` import that the dev server's dependency scan has not seen makes Vite re-optimize and reload the page when the lazy chunk first loads (#580 DIAG1).
const PACKAGES = fileURLToPath(new URL('../../../packages', import.meta.url));
const SPECIFIER = /\bfrom\s+['"](echarts\/[\w/]+)['"]/g;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '__fixtures__' ? [] : sources(path);
    return /\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe('vite optimizeDeps', () => {
  it('lists every bare echarts entry the SDK sources import', async () => {
    const resolved = typeof viteConfig === 'function' ? await viteConfig({ mode: 'development', command: 'serve' }) : await viteConfig;
    const entries = resolved.optimizeDeps?.include ?? [];
    // Each entry is `<package> > echarts/<x>`: Vite resolves the nested id from that package, which must depend on echarts itself (a bare id is not resolvable from this app and Vite skips it with a warning).
    for (const entry of entries) {
      const [owner, id] = entry.split(' > ');
      expect(id, entry).toMatch(/^echarts\//);
      const manifest = JSON.parse(readFileSync(join(PACKAGES, owner!.replace('@ap/', ''), 'package.json'), 'utf8')) as { dependencies?: Record<string, string> };
      expect(manifest.dependencies?.echarts, `${owner} must depend on echarts`).toBeTruthy();
    }
    const include = new Set(entries.map(entry => entry.split(' > ')[1]));
    const used = new Set<string>();
    for (const pkg of readdirSync(PACKAGES)) {
      let files: string[] = [];
      try { files = sources(join(PACKAGES, pkg, 'src')); } catch { continue; }
      for (const file of files) for (const m of readFileSync(file, 'utf8').matchAll(SPECIFIER)) used.add(m[1]);
    }
    expect([...used].length).toBeGreaterThan(0);
    expect([...used].filter(s => !include.has(s))).toEqual([]);
  });
});
