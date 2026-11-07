import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// #210: the platform's own `text-{success,info,warning,danger}-label` utilities were removed in favour of the
// feature-ui pair `text-text-*-label`. Tailwind silently ignores unknown classes, so a stale name would build and
// render in the inherited colour (a contrast regression). Scan the platform sources for the removed names.
const repo = join(process.cwd(), '../../..');
const roots = ['packages', 'menus', 'platform', 'apps'].map(dir => join(repo, dir));
// Raw variable names (`--text-*-label`, `token('text-*-label')`) are the feature-ui-owned tokens and stay valid.
const REMOVED = /(?<![\w-]|token\(['"])text-(success|info|warning|danger)-label\b/;

// An untracked temp file (the lint-dispatch probe in tooling/eslint) can vanish between listing and reading when packages test in parallel: skip it (#1437).
type Fs = { readdirSync: (dir: string) => string[]; statSync: (path: string) => { isDirectory: () => boolean } };
const realFs: Fs = { readdirSync: dir => readdirSync(dir), statSync: path => statSync(path) };
const vanished = (error: unknown) => (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';

export function sources(dir: string, fs: Fs = realFs): string[] {
  let names: string[];
  try { names = fs.readdirSync(dir); } catch (error) { if (vanished(error)) return []; throw error; }
  return names.flatMap(name => {
    if (['node_modules', 'dist', 'contract-report', 'test-results', 'playwright-report'].includes(name)) return [];
    const path = join(dir, name);
    try {
      if (fs.statSync(path).isDirectory()) return sources(path, fs);
    } catch (error) { if (vanished(error)) return []; throw error; }
    return /\.(tsx?|css|mjs|js)$/.test(name) ? [path] : [];
  });
}

function readIfPresent(path: string): string {
  try { return readFileSync(path, 'utf8'); } catch (error) { if (vanished(error)) return ''; throw error; }
}

export function removedLabelUses(code: string): string[] {
  return code.split('\n').filter(line => REMOVED.test(line));
}

describe('removed platform label utilities (#210)', () => {
  it('flags the old names and accepts the feature-ui pair', () => {
    expect(removedLabelUses("cn('text-success-label')")).toHaveLength(1);
    expect(removedLabelUses("cn('text-text-success-label')")).toHaveLength(0);
    expect(removedLabelUses("token('text-warning-label')")).toHaveLength(0);
    expect(removedLabelUses('color: rgb(var(--text-danger-label));')).toHaveLength(0);
  });

  it('skips a file that disappears while the tree is being walked (#1437)', () => {
    const enoent = () => Object.assign(new Error('gone'), { code: 'ENOENT' });
    const fake: Fs = {
      readdirSync: dir => (dir.endsWith('gone-dir') ? (() => { throw enoent(); })() : ['a.ts', 'probe.ts', 'gone-dir']),
      statSync: path => {
        if (path.endsWith('probe.ts')) throw enoent();
        return { isDirectory: () => path.endsWith('gone-dir') };
      },
    };
    expect(sources('/root', fake)).toEqual([join('/root', 'a.ts')]);
    expect(() => sources('/root', { ...fake, statSync: () => { throw new Error('EACCES'); } })).toThrow('EACCES');
  });

  it('no platform source uses a removed utility name', () => {
    const self = join(process.cwd(), 'src/styles/removed-label-utilities.test.ts');
    // Token tests and generated theme names contain raw token names, not utility classes
    // (the FO token-fidelity test names FO-owned raw tokens).
    const allowed = new Set([
      self,
      join(process.cwd(), 'src/styles/tokens.test.ts'),
      join(process.cwd(), 'src/styles/__tests__/token-fidelity.test.ts'),
      join(process.cwd(), 'src/theme/tokens.generated.ts'),
    ]);
    const offenders = roots.flatMap(root => sources(root)).filter(path => !allowed.has(path))
      .flatMap(path => removedLabelUses(readIfPresent(path)).map(line => `${path.slice(repo.length + 1)}: ${line.trim()}`));
    expect(offenders).toEqual([]);
  });
});
