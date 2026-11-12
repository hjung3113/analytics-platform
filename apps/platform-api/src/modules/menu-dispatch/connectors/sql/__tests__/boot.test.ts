import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';

import { loadConfig } from '../../../../../config.js';
import { loadMenuDeclarationSetup } from '../../../../../menu-declarations.js';
import type { CheckService } from '../../../../permissions/check-service.js';
import { routedBundle } from '../../../__tests__/bundle-fixtures.js';
import { declaredContribution } from '../../../declared-endpoints.js';
import type { DeclarationBundle } from '../../../declarations-file.js';

it.each(['main procedure', 'lookup procedure', 'mssql'] as const)('refuses %s at setup load and programmatic assembly', async (variant) => {
  const dir = await mkdtemp(join(tmpdir(), 'syn-sql-boot-'));
  try {
    const base = routedBundle();
    const owner = base.endpointOwners['syn.rows'];
    const procedure = { procedure: 'syn.read_rows', args: { rooms: 'scope.rooms', q: 'params.q' } };
    const bundle = {
      ...base,
      targets: { 'tgt-1': { ...base.targets['tgt-1'], dialect: variant === 'mssql' ? 'mssql' : 'postgres', connectionFile: join(dir, 'secret') } },
      endpointOwners: { 'syn.rows': { ...owner,
        ...(variant === 'main procedure' ? { call: procedure } : {}),
        ...(variant === 'lookup procedure' ? { scopeCheck: { mode: 'resolve-keys', lookup: procedure, keys: 'params.q', siteField: '/site', roomField: '/room' } } : {}),
      } },
    };
    await writeFile(join(dir, 'secret'), 'synthetic-secret');
    const file = join(dir, 'bundle.json');
    await writeFile(file, JSON.stringify(bundle));
    const reason = variant === 'mssql' ? 'sql dialect mssql is not available yet (ADR-0153 node 1839b2)' : 'sql procedure calls are not available for dialect postgres';
    const checkService = {} as CheckService;
    await expect(loadMenuDeclarationSetup({ ...loadConfig(), MENU_DECLARATIONS_FILE: file }, { checkService })).rejects.toMatchObject({ problems: [reason] });
    expect(() => declaredContribution({ bundle: bundle as unknown as DeclarationBundle, checkService })).toThrow(reason);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
