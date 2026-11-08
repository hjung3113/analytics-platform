// Module boundary (#1470, log-explorer §4): the explorer reads lifecycle only through the log-lifecycle barrel read port. No explorer
// source file imports a lifecycle repository, the lifecycle schema tables or a deep path of the module.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = new URL('..', import.meta.url).pathname;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sources(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

describe('log-explorer → log-lifecycle boundary', () => {
  it('imports lifecycle only through its barrel (index.js)', () => {
    const offenders: string[] = [];
    for (const file of sources(ROOT)) {
      for (const m of readFileSync(file, 'utf8').matchAll(/from\s+'([^']+)'/g)) {
        const target = m[1] ?? '';
        if (/log-lifecycle/.test(target) && !/log-lifecycle\/index\.js$/.test(target)) offenders.push(`${file}: ${target}`);
        if (/db\/schema\/log-lifecycle/.test(target)) offenders.push(`${file}: ${target}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
