// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * A consumer stylesheet reaches feature-screens classes through the package's style entry (`@import "<package>/styles.css"`),
 * never through an `@source` into its folders: a moved folder then fails loudly in one file instead of dropping classes silently (#1640).
 */
const root = fileURLToPath(new URL('../../../..', import.meta.url));
const SCAN_ROOTS = ['platform', 'menus', 'packages', 'apps/platform-web'];
const SKIP = new Set(['node_modules', 'dist', '.turbo']);

function stylesheets(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (SKIP.has(entry.name)) return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return stylesheets(path);
    return entry.name.endsWith('.css') ? [path] : [];
  });
}

describe('consumer styles.css (#1640)', () => {
  const files = SCAN_ROOTS.flatMap(scanRoot => stylesheets(join(root, scanRoot)));

  it('finds the consumer stylesheets it guards', () => {
    expect(files.map(file => relative(root, file))).toContain('packages/adapters/feature-bridge/src/styles.css');
  });

  it('has no @source into apps/feature-screens', () => {
    const offenders = files.flatMap(file => readFileSync(file, 'utf8').split('\n')
      .filter(line => /@source\b[^;]*apps\/feature-screens\//.test(line))
      .map(line => `${relative(root, file)}: ${line.trim()}`));
    expect(offenders).toEqual([]);
  });

  it('imports the style entry where it sources feature-screens classes', () => {
    const bridge = readFileSync(join(root, 'packages/adapters/feature-bridge/src/styles.css'), 'utf8');
    expect(bridge).toContain('@import "@ap/feature-screens/styles.css";');
  });
});
