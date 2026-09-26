import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PACKAGE_PREFIX } from './prefix.ts';

const SRC = dirname(fileURLToPath(import.meta.url));
const SCRIPTS = join(dirname(SRC), 'scripts');

function tsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(e => e.isFile() && /\.ts$/.test(e.name))
    .map(e => join(e.parentPath, e.name));
}

describe('prefix hygiene', () => {
  it('keeps the package prefix out of every source file except prefix.ts', () => {
    const files = [...tsFiles(SRC), ...tsFiles(SCRIPTS)].filter(f => f !== join(SRC, 'prefix.ts'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(readFileSync(file, 'utf8').includes(PACKAGE_PREFIX), file).toBe(false);
    }
  });
});
