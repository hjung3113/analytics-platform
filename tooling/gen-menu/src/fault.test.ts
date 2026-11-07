import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { APP_PKG, MOCK_ASSEMBLY_TSX, MENUS_TS, STYLE_CSS } from './generate.ts';
import { FIXTURE_GROUP, GEN_ARGS, CLI_PATH, appSnapshot, makeFixture, removeFixture, runCli, spawnNode } from './fixture.ts';

const APP_WRITE_MODULE = join(dirname(CLI_PATH), 'app-write.ts');

/** R1: arms the app-write seam — the first write to FAULT_PATH is partially written, then throws. */
function makePreload(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gen-menu-fault-'));
  keepPreloads.push(dir);
  const preload = join(dir, 'arm-write-fault.mjs');
  writeFileSync(preload, `import { setAppFileWriter } from ${JSON.stringify(APP_WRITE_MODULE)};
import fs from 'node:fs';
const original = fs.writeFileSync.bind(fs);
const target = process.env.FAULT_PATH;
let fired = false;
setAppFileWriter((path, data) => {
  const p = typeof path === 'string' ? path : String(path);
  if (!fired && p === target) {
    fired = true;
    if (typeof data === 'string' && data.length > 1) original(p, data.slice(0, data.length - 1));
    const error = new Error('injected ENOSPC during write');
    error.code = 'ENOSPC';
    throw error;
  }
  original(p, data);
});
`);
  return preload;
}

const keepPreloads: string[] = [];

async function runFaulty(root: string, faultPath: string, args: string[]): Promise<{ status: number; stderr: string }> {
  const preload = makePreload();
  const res = await spawnNode(
    ['--import', `file://${preload}`, CLI_PATH, '--root', root, ...args],
    { env: { ...process.env, FAULT_PATH: faultPath } },
  );
  return { status: res.status, stderr: res.stderr };
}

const TARGETS = [['menus.ts', MENUS_TS], ['mock-assembly.tsx', MOCK_ASSEMBLY_TSX], ['style.css', STYLE_CSS], ['package.json', APP_PKG]] as const;

/** Each placement root rolls back the same way: [label, extra generate flags, package folder]. */
const PLACEMENTS = [['menus', [], 'menus/mars/gen-probe'], ['platform', ['--platform'], 'platform/gen-probe']] as const;

describe('partial-write faults restore every snapshot (R1)', () => {
  const keep: string[] = [];
  const fresh = (): string => { const root = makeFixture(); keep.push(root); return root; };
  afterAll(() => {
    for (const dir of keepPreloads) rmSync(dir, { recursive: true, force: true });
    for (const root of keep) removeFixture(root);
  });

  for (const [place, extra, dir] of PLACEMENTS) for (const [label, rel] of TARGETS) {
    it(`generate (${place}): partial write of ${label} is restored from its snapshot`, async () => {
      const root = fresh();
      const pristine = appSnapshot(root);
      const res = await runFaulty(root, join(root, rel), [FIXTURE_GROUP, ...GEN_ARGS, ...extra]);
      expect(res.status, res.stderr).toBe(1);
      expect(appSnapshot(root), label).toEqual(pristine);
      expect(existsSync(join(root, dir))).toBe(false);
    });

    it(`remove (${place}): partial write of ${label} is restored and the package is kept`, async () => {
      const root = fresh();
      expect((await runCli([FIXTURE_GROUP, ...GEN_ARGS, ...extra], root)).status).toBe(0);
      const wired = appSnapshot(root);
      const res = await runFaulty(root, join(root, rel), ['--remove', FIXTURE_GROUP]);
      expect(res.status, res.stderr).toBe(1);
      expect(appSnapshot(root), label).toEqual(wired);
      expect(existsSync(join(root, dir))).toBe(true);
    });
  }
});
