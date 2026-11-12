import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

// The real mssql driver logs statement text and parameter values under `mssql:*` when DEBUG enables them.
const child = fileURLToPath(new URL('./mssql-debug-child.ts', import.meta.url));
const run = (debug: string) => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', child], { env: { ...process.env, DEBUG: debug }, encoding: 'utf8', timeout: 30000 });
  return { ...result, logged: JSON.parse(result.stdout || 'null') as { tedi: boolean; base: boolean; other: boolean } | null };
};

it.each(['mssql:*', '*', 'mssql:tedi,mssql:base'])('keeps driver diagnostics silent with DEBUG=%s, leaking no statement or value', (debug) => {
  const result = run(debug);
  expect(result.status, result.stderr).toBe(0);
  expect(result.logged).toMatchObject({ tedi: false, base: false });
  expect(result.stderr).not.toContain('syn-private');
  expect(result.stderr).not.toContain('syn.read_rows');
});
it('leaves other debug namespaces as configured', () => {
  const result = run('syn-other:*,mssql:*');
  expect(result.logged).toEqual({ tedi: false, base: false, other: true });
  expect(result.stderr).toContain('syn-other-visible');
  expect(result.stderr).not.toContain('syn-private');
});
