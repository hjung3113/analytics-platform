import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import type { SourceOwnerAccess } from './deps.js';
import { denyAllSourceOwners } from './deps.js';
import type { SourceReadPort } from './ports/source-read.js';
import { createDirectoryProvider, createProviderSourceReadPort } from './adapters/provider-source.js';

/** Secret grants are re-read for every judgment, including the final response check. No body, path or configuration value is logged. */
export function sourceAssemblyFromEnv(env: NodeJS.ProcessEnv = process.env): { sourceReadPort: SourceReadPort | null; sourceOwnerAccess: SourceOwnerAccess } {
  if (!env.LOG_EXPLORER_SOURCE_PROVIDER) return { sourceReadPort: null, sourceOwnerAccess: denyAllSourceOwners };
  try {
    if (env.LOG_EXPLORER_SOURCE_PROVIDER !== 'directory') throw new Error();
    const roots: unknown = JSON.parse(env.LOG_EXPLORER_SOURCE_ROOTS ?? '{}');
    if (!roots || typeof roots !== 'object' || Array.isArray(roots) || Object.keys(roots).length === 0 || !Object.values(roots).every(v => typeof v === 'string' && isAbsolute(v))) throw new Error();
    const grantFile = env.LOG_EXPLORER_SOURCE_GRANTS_FILE;
    const sourceOwnerAccess: SourceOwnerAccess = {
      async allows(actor, owner) {
        if (!grantFile || !isAbsolute(grantFile)) return false;
        try {
          const raw = await readFile(grantFile, 'utf8');
          if (raw.length > 1024 * 1024) return false;
          const grants: unknown = JSON.parse(raw);
          if (!Array.isArray(grants)) return false;
          return grants.some(g => g && typeof g === 'object' && Object.keys(g).length === 3 && g.workspaceId === actor.workspace_id && g.actorId === actor.actor_id && g.sourceOwner === owner);
        } catch { return false; }
      },
    };
    return { sourceReadPort: createProviderSourceReadPort(createDirectoryProvider(roots as Record<string, string>)), sourceOwnerAccess };
  } catch { throw new Error('invalid_source_config'); }
}
