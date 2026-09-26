import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PACKAGE_PREFIX } from './prefix.ts';
import { repoRoot } from './fixture.ts';
import {
  GROUPS_END, IMPORT_END, IMPORT_START, MENUS_TS, SPREADS_END, SPREADS_START, STYLES_END, STYLES_START,
} from './generate.ts';

const ROOT = repoRoot();
const GROUP_IDS = ['overview', 'equipment', 'masterData', 'analytics', 'metrics', 'noticeVoc', 'admin'] as const;
const SPREAD_BINDINGS = ['home', 'equipment', 'masterData', 'analytics', 'metrics', 'noticeVoc', 'admin'] as const;
const STYLE_FOLDERS = ['home', 'equipment', 'analytics', 'metrics'] as const;

const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');

describe('committed wiring locks (real repo, read-only)', () => {
  it('has all generator markers in menus.ts and style.css', () => {
    const menus = read(MENUS_TS);
    for (const marker of [IMPORT_START, IMPORT_END, GROUPS_END, SPREADS_START, SPREADS_END]) {
      expect(menus.includes(marker), marker).toBe(true);
    }
    const styles = read('apps/platform-web/src/style.css');
    for (const marker of [STYLES_START, STYLES_END]) {
      expect(styles.includes(marker), marker).toBe(true);
    }
  });

  it('keeps the seven spread bindings and GROUPS ids in today\'s order', () => {
    const lines = read(MENUS_TS).split('\n');
    const trimAt = (marker: string): number => lines.findIndex(l => l.trim() === marker);
    const spreads = lines.slice(trimAt(SPREADS_START) + 1, trimAt(SPREADS_END)).filter(l => l.trimStart().startsWith('...'));
    expect(spreads).toEqual(SPREAD_BINDINGS.map(b => `  ...${b},`));

    const groupsStart = lines.findIndex(l => l.startsWith('export const GROUPS'));
    const ids = lines.slice(groupsStart + 1, trimAt(GROUPS_END))
      .map(l => /id: '([^']+)'/.exec(l)?.[1])
      .filter(x => x !== undefined);
    expect(ids).toEqual([...GROUP_IDS]);
  });

  it('keeps the GroupId union exactly the seven current members', () => {
    const line = read('packages/contracts/src/menu.ts')
      .split('\n')
      .find(l => l.startsWith('export type GroupId ='));
    expect(line).toBe(`export type GroupId = ${GROUP_IDS.map(id => `'${id}'`).join(' | ')};`);
  });

  it('keeps the menu dependency block contiguous and lexicographic', () => {
    const lines = read('apps/platform-web/package.json').split('\n');
    const depRe = /^    "([^"]+)": "workspace:\*",$/;
    const entries = lines
      .map((l, i) => {
        const m = depRe.exec(l);
        return m === null ? null : { name: m[1], at: i };
      })
      .filter(x => x !== null);
    const menuEntries = entries.filter(e => e.name.startsWith(`${PACKAGE_PREFIX}menu-`));
    expect(menuEntries.length).toBeGreaterThan(0);
    for (let i = 1; i < menuEntries.length; i++) {
      expect(menuEntries[i].at - menuEntries[i - 1].at, 'contiguous').toBe(1);
    }
    const names = menuEntries.map(e => e.name);
    expect(names).toEqual([...names].sort());
  });

  it('keeps the four menu style imports inside the marker', () => {
    const lines = read('apps/platform-web/src/style.css').split('\n');
    const start = lines.findIndex(l => l.trim() === STYLES_START);
    const end = lines.findIndex(l => l.trim() === STYLES_END);
    const inner = lines.slice(start + 1, end).filter(l => l !== '');
    expect(inner).toEqual(STYLE_FOLDERS.map(f => `@import "${PACKAGE_PREFIX}menu-${f}/styles.css";`));
  });

  it('has no probe leftovers', () => {
    expect(existsSync(join(ROOT, 'menus', 'gen-probe'))).toBe(false);
    for (const rel of [MENUS_TS, 'apps/platform-web/src/style.css', 'packages/contracts/src/menu.ts', 'apps/platform-web/package.json']) {
      expect(read(rel).includes('genProbe'), rel).toBe(false);
    }
  });
});
