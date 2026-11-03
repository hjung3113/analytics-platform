import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { JobLog } from '../../../lib/job-log.js';
import { readPlatformSystemsFile } from '../platform-systems-sync.js';

function recordingLog() {
  const lines: Array<{ level: string; msg: string; meta?: Record<string, unknown> | undefined }> = [];
  const log: JobLog = {
    info: (msg, meta) => lines.push({ level: 'info', msg, meta }),
    warn: (msg, meta) => lines.push({ level: 'warn', msg, meta }),
    error: (msg, meta) => lines.push({ level: 'error', msg, meta }),
  };
  return { log, lines };
}

describe('readPlatformSystemsFile (no database)', () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'platform-systems-file-'));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('reads a valid file', async () => {
    const path = join(dir, 'ok.json');
    await writeFile(path, JSON.stringify({ version: 1, systems: [{ space_id: 'mars', name: 'MARS' }] }));
    const { log } = recordingLog();
    expect(await readPlatformSystemsFile(path, log)).toEqual({
      kind: 'ok',
      systems: [{ space_id: 'mars', name: 'MARS' }],
    });
  });

  it('a valid empty declaration is ok, not absent', async () => {
    const path = join(dir, 'empty.json');
    await writeFile(path, JSON.stringify({ version: 1, systems: [] }));
    expect(await readPlatformSystemsFile(path, recordingLog().log)).toEqual({ kind: 'ok', systems: [] });
  });

  it.each([undefined, '', join(tmpdir(), 'definitely-missing-platform-systems.json')])(
    'unset or missing path (%s) is absent',
    async (path) => {
      expect((await readPlatformSystemsFile(path, recordingLog().log)).kind).toBe('absent');
    },
  );

  it.each([
    ['not JSON', 'secret-token {'],
    ['wrong shape', JSON.stringify({ version: 1, systems: [{ space_id: '' }] })],
  ])('%s is invalid: one error, no file content logged', async (_label, content) => {
    const path = join(dir, `${Math.random()}.json`);
    await writeFile(path, content);
    const { log, lines } = recordingLog();
    expect((await readPlatformSystemsFile(path, log)).kind).toBe('invalid');
    expect(lines.filter((l) => l.level === 'error')).toHaveLength(1);
    expect(JSON.stringify(lines)).not.toContain('secret-token');
  });

  it('an unreadable path (a directory) is invalid, not absent', async () => {
    expect((await readPlatformSystemsFile(dir, recordingLog().log)).kind).toBe('invalid');
  });
});
