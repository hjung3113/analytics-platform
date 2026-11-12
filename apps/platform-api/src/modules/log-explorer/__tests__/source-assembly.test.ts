import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sourceAssemblyFromEnv } from '../source-assembly.js';

describe('production Source assembly', () => {
  it('is disabled by default and rejects unknown or malformed provider config without exposing values', () => {
    expect(sourceAssemblyFromEnv({}).sourceReadPort).toBeNull();
    expect(() => sourceAssemblyFromEnv({ LOG_EXPLORER_SOURCE_PROVIDER: 'private secret' })).toThrow('invalid_source_config');
  });
  it('enables directory reads with exact workspace/actor/owner grants, reloads revocation, and denies invalid grants', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'source-grants-'));
    try {
      const path = join(dir, 'grants.json');
      await writeFile(path, JSON.stringify([{ workspaceId: 'ws', actorId: 'actor', sourceOwner: 'owner' }]));
      const assembly = sourceAssemblyFromEnv({ LOG_EXPLORER_SOURCE_PROVIDER: 'directory', LOG_EXPLORER_SOURCE_ROOTS: JSON.stringify({ owner: dir }), LOG_EXPLORER_SOURCE_GRANTS_FILE: path });
      expect(assembly.sourceReadPort).not.toBeNull();
      const allows = (workspace_id = 'ws', actor_id = 'actor', owner = 'owner') => assembly.sourceOwnerAccess.allows({ workspace_id, actor_id }, owner);
      expect(await allows()).toBe(true);
      expect(await allows('other')).toBe(false);
      expect(await allows('ws', 'other')).toBe(false);
      expect(await allows('ws', 'actor', 'other')).toBe(false);
      await writeFile(path, '[]'); expect(await allows()).toBe(false);
      await writeFile(path, 'malformed private'); expect(await allows()).toBe(false);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
