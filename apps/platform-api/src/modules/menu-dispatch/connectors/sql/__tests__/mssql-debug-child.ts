// Child process for mssql-debug.test.ts: DEBUG is set by the parent before this module graph loads.
import { createRequire } from 'node:module';

import { TargetSecret } from '../../../bundle/secrets.js';
import { createMssqlConnector } from '../mssql.js';

const driverRequire = createRequire(createRequire(import.meta.url).resolve('mssql'));
const debugLib = driverRequire('debug') as { (namespace: string): (...args: unknown[]) => void; enabled(namespace: string): boolean };
const logged = { tedi: debugLib.enabled('mssql:tedi'), base: debugLib.enabled('mssql:base'), other: debugLib.enabled('syn-other:x') };
// What the driver's request logger does with statement text and values.
debugLib('mssql:tedi')('execute syn.read_rows', 'syn-private-value');
debugLib('mssql:base')('query SELECT syn-private-statement');
debugLib('syn-other:x')('syn-other-visible');
const connector = createMssqlConnector(
  { kind: 'sql', dialect: 'mssql', connectionFile: '/synthetic/secret' },
  { kind: 'sql', connection: new TargetSecret('Server=localhost,1;Database=syn;User Id=syn;Password=syn-private-password;Encrypt=false') },
);
const leg = { targetId: 'syn', site: 'SITE-A', rooms: ['RA1'], call: { procedure: 'syn.read_rows', args: { q: 'params.q' } }, bindings: { args: { q: 'syn-private-value' } } };
try {
  for await (const _row of connector.query(leg as never, { signal: new AbortController().signal, deadlineMs: 3000, rowCap: 5 })) { /* none */ }
} catch { /* the unreachable port is the point */ }
process.stdout.write(JSON.stringify(logged));
process.exit(0);
