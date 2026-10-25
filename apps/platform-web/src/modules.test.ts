import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EQV_MODULE, EQV_PREFIX, EQV_SPACE, modulePermissions } from './modules';
import { registry } from './menus';

const SRC = path.dirname(fileURLToPath(import.meta.url));

function sourcesOutsideDev(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'dev' ? [] : sourcesOutsideDev(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

describe('EV host module mount (#801)', () => {
  it('registers its group and screens at the one placement', () => {
    expect(registry.groupById('eqv:equipment')?.space).toBe(EQV_SPACE);
    expect(registry.menuById('eqv:topview')?.path).toBe(EQV_PREFIX);
    expect(registry.menuById('eqv:focus')?.path).toBe(`${EQV_PREFIX}/focus`);
    expect(EQV_MODULE.menus.map(menu => menu.id)).toEqual(['eqv:topview', 'eqv:focus']);
  });

  it('keeps its permission out of the app vocabulary and collects it from the module menus', () => {
    expect(registry.permissions).not.toContain('eqv:view');
    expect(modulePermissions(registry)).toEqual(['eqv:view']);
  });

  it.each(['react', 'react-dom', '@ap/ui', '@ap/contracts'])('gives the adapter the app\'s own %s, not a second copy', name => {
    const appModules = path.resolve(SRC, '..', 'node_modules');
    const adapter = realpathSync(path.join(appModules, '@eqv', 'platform-adapter'));
    // pnpm links an adapter's peers beside it in the virtual store; the real path must be the app's real path.
    const seenByAdapter = realpathSync(path.join(path.dirname(path.dirname(adapter)), ...name.split('/')));
    expect(seenByAdapter).toBe(realpathSync(path.join(appModules, ...name.split('/'))));
  });

  it('imports the EV mock data from src/dev/ only (ADR-0009)', () => {
    const offenders = sourcesOutsideDev(SRC)
      .filter(file => !file.endsWith('server-conformance.test.ts') && !file.endsWith('modules.test.ts'))
      .filter(file => readFileSync(file, 'utf8').includes('@eqv/platform-adapter/mock-data'));
    expect(offenders).toEqual([]);
  });
});
