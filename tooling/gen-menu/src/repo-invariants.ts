import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PACKAGE_PREFIX } from './prefix.ts';
import {
  APP_PKG, GROUPS_END, IMPORT_END, IMPORT_START, MENUS_TS, SPREADS_END, SPREADS_START,
  STYLES_END, STYLES_START, STYLE_CSS, manifestEntries, parseDepLine,
} from './generate.ts';

const CONTRACTS_MENU = 'packages/contracts/src/menu.ts';
const MENUS_MARKERS = [IMPORT_START, IMPORT_END, GROUPS_END, SPREADS_START, SPREADS_END] as const;

/** Everything the wiring invariants read from one repo tree. */
export type RepoShape = {
  menusTs: string;
  styleCss: string;
  contracts: string;
  appPkg: string;
  /** Folder names under menus/. */
  folders: string[];
  /** Folders that ship a src/styles.css and therefore need an app-side @import. */
  cssFolders: string[];
  /** menus/<folder>/src/index.ts text by folder. */
  indexes: Record<string, string>;
};

export function loadShape(root: string): RepoShape {
  const folders = existsSync(join(root, 'menus'))
    ? readdirSync(join(root, 'menus'), { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name)
    : [];
  const indexes: Record<string, string> = {};
  const cssFolders: string[] = [];
  for (const folder of folders) {
    const index = join(root, 'menus', folder, 'src', 'index.ts');
    if (existsSync(index)) indexes[folder] = readFileSync(index, 'utf8');
    if (existsSync(join(root, 'menus', folder, 'src', 'styles.css'))) cssFolders.push(folder);
  }
  return {
    menusTs: readFileSync(join(root, MENUS_TS), 'utf8'),
    styleCss: readFileSync(join(root, STYLE_CSS), 'utf8'),
    contracts: readFileSync(join(root, CONTRACTS_MENU), 'utf8'),
    appPkg: readFileSync(join(root, APP_PKG), 'utf8'),
    folders,
    cssFolders,
    indexes,
  };
}

function countOccurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

function markerIndex(lines: string[], marker: string): number {
  const at = lines.findIndex(l => l.trim() === marker);
  if (at === -1) throw new Error(`missing marker '${marker}'`);
  return at;
}

function section(lines: string[], start: string, end: string): string {
  return lines.slice(markerIndex(lines, start) + 1, markerIndex(lines, end)).join('\n');
}

function groupUnion(contracts: string): string[] {
  const line = contracts.split('\n').find(l => l.startsWith('export type GroupId ='));
  if (line === undefined) throw new Error(`GroupId union line not found in ${CONTRACTS_MENU}`);
  return [...line.matchAll(/'([^']+)'/g)].map(m => m[1]);
}

const toBinding = (folder: string): string => folder.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/** Markers exist exactly once and in import → groups → spreads (→ styles) order. */
export function checkMarkers(shape: RepoShape): void {
  for (const marker of MENUS_MARKERS) {
    if (countOccurrences(shape.menusTs, marker) !== 1) {
      throw new Error(`marker '${marker}' must appear exactly once in ${MENUS_TS}`);
    }
  }
  for (const marker of [STYLES_START, STYLES_END]) {
    if (countOccurrences(shape.styleCss, marker) !== 1) {
      throw new Error(`marker '${marker}' must appear exactly once in ${STYLE_CSS}`);
    }
  }
  const menusLines = shape.menusTs.split('\n');
  const order = MENUS_MARKERS.map(m => markerIndex(menusLines, m));
  for (let k = 1; k < order.length; k++) {
    if (order[k] <= order[k - 1]) throw new Error(`markers out of order in ${MENUS_TS}: ${MENUS_MARKERS.join(', ')}`);
  }
  if (markerIndex(shape.styleCss.split('\n'), STYLES_START) > markerIndex(shape.styleCss.split('\n'), STYLES_END)) {
    throw new Error(`markers out of order in ${STYLE_CSS}`);
  }
}

/** Every GroupId union member owns exactly one GROUPS row and exactly one menu index owner. */
export function checkGroups(shape: RepoShape): void {
  const union = groupUnion(shape.contracts);
  const menusLines = shape.menusTs.split('\n');
  const groupsSection = menusLines.slice(0, markerIndex(menusLines, GROUPS_END)).join('\n');
  const owners = Object.entries(shape.indexes).map(([folder, text]) => ({
    folder,
    entries: manifestEntries(text, `menus/${folder}/src/index.ts`),
  }));
  for (const group of union) {
    const rowRe = new RegExp(`(?<![\\w$])id: '${group}'`);
    const rows = groupsSection.split('\n').filter(l => rowRe.test(l)).length;
    if (rows !== 1) throw new Error(`group '${group}' must have exactly one GROUPS row, found ${rows}`);
    const owned = owners.filter(o => o.entries.some(e => e.group === group));
    if (owned.length !== 1) {
      throw new Error(`group '${group}' must be owned by exactly one menus/*/src/index.ts, found ${owned.length === 0 ? 'none' : owned.map(o => o.folder).join(',')}`);
    }
  }
}

/**
 * Contiguous, lexicographic menu dependency block; every menu dependency wired to a
 * manifests import and spread inside the markers; every shipped styles.css imported in the
 * style markers.
 */
export function checkWiring(shape: RepoShape): void {
  const deps = shape.appPkg.split('\n').map(parseDepLine).filter(d => d !== null);
  if (deps.length === 0) throw new Error(`no menu dependency block in ${APP_PKG}`);
  const names = deps.map(d => d.name);
  for (let k = 1; k < names.length; k++) {
    if (names[k] <= names[k - 1]) throw new Error(`menu dependency block in ${APP_PKG} is not lexicographic: '${names[k - 1]}' >= '${names[k]}'`);
  }
  const menusLines = shape.menusTs.split('\n');
  const importSection = section(menusLines, IMPORT_START, IMPORT_END);
  const spreadSection = section(menusLines, SPREADS_START, SPREADS_END);
  const styleSection = section(shape.styleCss.split('\n'), STYLES_START, STYLES_END);
  for (const name of names) {
    const folder = name.slice(`${PACKAGE_PREFIX}menu-`.length);
    const binding = toBinding(folder);
    if (!new RegExp(`import \\{ manifests as ${binding} \\} from '${name}';`).test(importSection)) {
      throw new Error(`dependency '${name}' has no manifests import inside the import markers`);
    }
    if (!spreadSection.includes(`...${binding},`)) {
      throw new Error(`dependency '${name}' has no spread inside the spread markers`);
    }
  }
  for (const folder of shape.cssFolders) {
    const cssImport = `@import "${PACKAGE_PREFIX}menu-${folder}/styles.css";`;
    if (!styleSection.includes(cssImport)) {
      throw new Error(`menus/${folder}/src/styles.css has no @import inside the style markers`);
    }
  }
}

/** Probe leftovers by name only; skipped while the probe's own menu exists (GEN_MENU_PROBE=1). */
export function checkNoProbe(shape: RepoShape, skip: boolean): void {
  if (skip) return;
  const surfaces = [
    [CONTRACTS_MENU, shape.contracts], [MENUS_TS, shape.menusTs],
    [STYLE_CSS, shape.styleCss], [APP_PKG, shape.appPkg],
  ] as const;
  for (const name of ['genProbe', 'gen-probe']) {
    for (const [label, text] of surfaces) {
      if (text.includes(name)) throw new Error(`probe leftover '${name}' found in ${label}`);
    }
    if (shape.folders.includes(name)) throw new Error(`probe leftover: menus/${name} exists`);
  }
}
