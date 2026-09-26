import { existsSync, readFileSync, realpathSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { depLine, importLine, renderFiles, spreadLine, styleLine, type MenuInputs } from './templates.ts';
import {
  APP_PKG, GROUP_RE, GenMenuError, MENUS_TS, STYLE_CSS,
  IMPORT_END, IMPORT_START, SPREADS_END, SPREADS_START, STYLES_END, STYLES_START,
  checkAppMarkers, checkInsideRoot, kebab, ownedLine, parseDepLine, splitLines, type OwnedLineState,
} from './generate.ts';
import { writeAppFile } from './app-write.ts';

export type InsertSpec = { relPath: string; line: string; start?: string; end?: string };

export type RemovePlan = {
  root: string;
  inputs: MenuInputs;
  packageDir: string;
  /** The exact insert lines that must be removed, bounded to their owned region (F4). */
  inserts: InsertSpec[];
  deleteDir: string;
};

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
  // F9: the deletion target and every edited file must resolve inside the real root.
  const realRoot = realpathSync(root);
  checkInsideRoot(realRoot, packageDir, `--remove: menus/${folder}`);
  for (const rel of [MENUS_TS, STYLE_CSS, APP_PKG]) checkInsideRoot(realRoot, join(root, rel), `--remove: ${rel}`);

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

  const menusLines = splitLines(readFileSync(join(root, MENUS_TS), 'utf8')).lines;
  const styleLines = splitLines(readFileSync(join(root, STYLE_CSS), 'utf8')).lines;
  const pkgLines = splitLines(readFileSync(join(root, APP_PKG), 'utf8')).lines;
  // F7: the same marker rules apply on removal — the regions must be well-formed.
  checkAppMarkers(menusLines.join('\n'), styleLines.join('\n'));
  const inserts: InsertSpec[] = [
    { relPath: MENUS_TS, line: importLine(inputs), start: IMPORT_START, end: IMPORT_END },
    { relPath: MENUS_TS, line: spreadLine(inputs), start: SPREADS_START, end: SPREADS_END },
    { relPath: STYLE_CSS, line: styleLine(inputs), start: STYLES_START, end: STYLES_END },
    { relPath: APP_PKG, line: depLine(inputs) },
  ];
  for (const ins of inserts) {
    const lines = ins.relPath === MENUS_TS ? menusLines : ins.relPath === STYLE_CSS ? styleLines : pkgLines;
    const owned = ins.start !== undefined && ins.end !== undefined
      ? ownedLine(lines, ins.start, ins.end, ins.line)
      : depOwnership(lines, ins.line);
    if (owned.kind === 'missing') {
      throw new GenMenuError(`--remove: ${ins.relPath} was edited — the generated line is not present inside its owned region`);
    }
    if (owned.kind === 'duplicate') {
      throw new GenMenuError(`--remove: ${ins.relPath} was edited — the generated line appears ${owned.count} times inside its owned region`);
    }
  }

  const known = new Set([...renderFiles(inputs).map(f => f.relPath), '.gen-menu.json']);
  checkEntries(packageDir, `menus/${folder}`, '', known);

  return { root, inputs, packageDir, inserts, deleteDir: `menus/${folder}` };
}

/** F4: the dep line is owned only when it appears exactly once inside the contiguous menu-dependency block. */
function depOwnership(lines: string[], line: string): OwnedLineState {
  const entries = lines
    .map((l, i) => ({ i, dep: parseDepLine(l) }))
    .filter((e): e is { i: number; dep: { indent: string; name: string } } => e.dep !== null);
  const first = entries[0];
  const last = entries.at(-1);
  if (first === undefined || last === undefined || entries.length !== last.i - first.i + 1) {
    return { kind: 'missing' };
  }
  const bare = line.replace(/,$/, '');
  let count = 0;
  let at = -1;
  for (const e of entries) {
    const t = (lines[e.i] as string).replace(/\r$/, '');
    if (t === line || t === bare) {
      count++;
      at = e.i;
    }
  }
  if (count === 1) return { kind: 'found', at };
  return count === 0 ? { kind: 'missing' } : { kind: 'duplicate', count };
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

/** F4: remove exactly the owned occurrence; refuse anything ambiguous before touching a byte. */
function removeOwnedLine(text: string, ins: InsertSpec): string {
  const { lines, eol } = splitLines(text);
  const owned = ins.start !== undefined && ins.end !== undefined
    ? ownedLine(lines, ins.start, ins.end, ins.line)
    : depOwnership(lines, ins.line);
  if (owned.kind !== 'found') throw new GenMenuError(`--remove: ${ins.relPath} was edited — the generated line is not uniquely present inside its owned region`);
  lines.splice(owned.at, 1);
  if (ins.relPath === APP_PKG) {
    // R4: the removed entry may have carried the object's closing comma position — the next
    // non-whitespace token decides, skipping blank/whitespace-only lines.
    const prev = (lines[owned.at - 1] ?? '') as string;
    let next = '';
    for (let k = owned.at; k < lines.length; k++) {
      const candidate = (lines[k] as string).replace(/\r$/, '');
      if (candidate.trim() !== '') {
        next = candidate;
        break;
      }
    }
    if (prev.trimEnd().endsWith(',') && next.trimStart().startsWith('}')) {
      lines[owned.at - 1] = prev.trimEnd().slice(0, -1);
    }
  }
  return lines.join(eol);
}

export function applyRemove(plan: RemovePlan): void {
  // F3: snapshot every app file before the first mutation; restore on failure.
  const snapshots = new Map<string, string>();
  for (const rel of new Set(plan.inserts.map(i => i.relPath))) {
    snapshots.set(rel, readFileSync(join(plan.root, rel), 'utf8'));
  }
  const edited = new Map<string, string>();
  // R1: a target is ATTEMPTED before writeFileSync runs — a partial write that throws still
  // counts, because its bytes may already differ from the snapshot.
  const attemptedWrites = new Set<string>();
  const failures: string[] = [];
  let originalError: unknown;
  let failedDeletingDir = false;
  let wroteAllAppFiles = false;
  try {
    for (const ins of plan.inserts) {
      const current = edited.get(ins.relPath) ?? readFileSync(join(plan.root, ins.relPath), 'utf8');
      edited.set(ins.relPath, removeOwnedLine(current, ins));
    }
    // R4: the planned app manifest must stay valid JSON before anything is written.
    const plannedPkg = edited.get(APP_PKG);
    if (plannedPkg !== undefined) {
      try {
        JSON.parse(plannedPkg);
      } catch (err) {
        throw new GenMenuError(`planned ${APP_PKG} is invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    for (const [rel, content] of edited) {
      attemptedWrites.add(rel);
      writeAppFile(join(plan.root, rel), content);
    }
    wroteAllAppFiles = true;
    // R1: the final recursive deletion is inside the recovery/report scope — a failure here is
    // residual state (app wiring already removed) and must be reported, not thrown bare.
    rmSync(plan.packageDir, { recursive: true });
  } catch (err) {
    originalError = err;
    failedDeletingDir = wroteAllAppFiles;
  }
  if (originalError !== undefined) {
    // R1/F3: restore every attempted target whose bytes drifted from its snapshot.
    for (const rel of attemptedWrites) {
      try {
        const snapshot = snapshots.get(rel) ?? '';
        if (readFileSync(join(plan.root, rel), 'utf8') !== snapshot) writeFileSync(join(plan.root, rel), snapshot);
      } catch (restoreErr) {
        failures.push(`${rel}: ${restoreErr instanceof Error ? restoreErr.message : String(restoreErr)}`);
      }
    }
    if (failedDeletingDir) {
      // Best-effort retry, then report the residual package directory.
      try {
        rmSync(plan.packageDir, { recursive: true, force: true });
      } catch {
        // reported below via the residual check
      }
      if (existsSync(plan.packageDir)) {
        failures.push(`menus/${plan.inputs.folder}: could not be fully deleted — package directory remains`);
      }
    }
    const original = originalError instanceof Error ? originalError : new GenMenuError(String(originalError));
    if (failures.length > 0) {
      throw new GenMenuError(`--remove failed (${original.message}) and rollback could not restore: ${failures.join('; ')}`);
    }
    throw original;
  }
}
