import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { depLine, importLine, renderFiles, spreadLine, styleLine, type MenuInputs } from './templates.ts';
import { APP_PKG, GROUP_RE, GenMenuError, MENUS_TS, STYLE_CSS, kebab, removeLine } from './generate.ts';

export type RemovePlan = {
  root: string;
  inputs: MenuInputs;
  packageDir: string;
  /** The exact insert lines that must be removed, with the files they live in. */
  inserts: { relPath: string; line: string }[];
  deleteDir: string;
};

export type RemoveArgs = {
  root: string;
  group: string;
  inputs: MenuInputs;
  /** Rollback after a failed write: a missing insert or folder counts as already gone. */
  allowMissing: boolean;
};

function readApp(root: string, rel: string, allowMissing: boolean): string {
  const path = join(root, rel);
  if (!existsSync(path)) {
    if (allowMissing) return '';
    throw new GenMenuError(`--remove: ${rel} not found`);
  }
  return readFileSync(path, 'utf8');
}

/** Best-effort revert used when an app edit throws mid-generate. Never throws for "already gone". */
export function rollbackAfterFailedWrite(root: string, inputs: MenuInputs): void {
  const inserts = [
    { relPath: MENUS_TS, line: importLine(inputs) },
    { relPath: MENUS_TS, line: spreadLine(inputs) },
    { relPath: STYLE_CSS, line: styleLine(inputs) },
    { relPath: APP_PKG, line: depLine(inputs) },
  ];
  const edited = new Map<string, string>();
  for (const ins of inserts) {
    const current = edited.get(ins.relPath) ?? readApp(root, ins.relPath, true);
    if (current === '') continue;
    edited.set(ins.relPath, removeLine(current, ins.line));
  }
  for (const [rel, content] of edited) writeFileSync(join(root, rel), content);
  rmSync(join(root, 'menus', inputs.folder), { recursive: true, force: true });
}

/** Check-only; throws `--remove: …` refusals and deletes nothing. */
export function planRemove(root: string, group: string): RemovePlan {
  if (!GROUP_RE.test(group)) {
    throw new GenMenuError(`invalid group id '${group}'`);
  }
  const folder = kebab(group);
  const packageDir = join(root, 'menus', folder);
  if (!existsSync(packageDir)) {
    throw new GenMenuError(`--remove: menus/${folder} does not exist`);
  }
  const metaPath = join(packageDir, '.gen-menu.json');
  const failNotGenerated = (): GenMenuError =>
    new GenMenuError(`--remove: menus/${folder}/.gen-menu.json: not a generated package`);
  if (!existsSync(metaPath)) throw failNotGenerated();
  let inputs: MenuInputs;
  try {
    inputs = JSON.parse(readFileSync(metaPath, 'utf8')) as MenuInputs;
  } catch {
    throw failNotGenerated();
  }
  if (inputs.group !== group) {
    throw new GenMenuError(`--remove: menus/${folder}/.gen-menu.json: not a generated package (group '${inputs.group}')`);
  }

  for (const f of renderFiles(inputs)) {
    const path = join(packageDir, f.relPath);
    if (!existsSync(path) || readFileSync(path, 'utf8') !== f.content) {
      throw new GenMenuError(`--remove: menus/${folder}/${f.relPath} was edited`);
    }
  }

  const inserts: RemovePlan['inserts'] = [
    { relPath: MENUS_TS, line: importLine(inputs) },
    { relPath: MENUS_TS, line: spreadLine(inputs) },
    { relPath: STYLE_CSS, line: styleLine(inputs) },
    { relPath: APP_PKG, line: depLine(inputs) },
  ];
  for (const ins of inserts) {
    if (!readFileSync(join(root, ins.relPath), 'utf8').includes(ins.line)) {
      throw new GenMenuError(`--remove: ${ins.relPath} was edited`);
    }
  }

  const known = new Set([...renderFiles(inputs).map(f => f.relPath), '.gen-menu.json']);
  checkEntries(packageDir, `menus/${folder}`, '', known);

  return { root, inputs, packageDir, inserts, deleteDir: `menus/${folder}` };
}

/** Tool artifact directories turbo/vitest create at the top level of the package; deleted with the folder. */
const ARTIFACT_DIRS = new Set(['node_modules', '.turbo', 'dist', 'coverage']);

/** Only the known files (and top-level tool artifact dirs) may exist inside the generated package. */
function checkEntries(dir: string, display: string, base: string, known: Set<string>): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const rel = base === '' ? e.name : `${base}/${e.name}`;
    if (e.isDirectory()) {
      if (base === '' && ARTIFACT_DIRS.has(e.name)) continue;
      checkEntries(join(dir, e.name), display, rel, known);
    } else if (!known.has(rel)) {
      throw new GenMenuError(`--remove: unexpected file ${display}/${rel}`);
    }
  }
}

export function applyRemove(plan: RemovePlan): void {
  const edited = new Map<string, string>();
  for (const ins of plan.inserts) {
    const current = edited.get(ins.relPath) ?? readFileSync(join(plan.root, ins.relPath), 'utf8');
    edited.set(ins.relPath, removeLine(current, ins.line));
  }
  for (const [rel, content] of edited) writeFileSync(join(plan.root, rel), content);
  rmSync(plan.packageDir, { recursive: true });
}
