// Writes `src/vocab.json`: the closed vocabularies a server outside this workspace must mirror (#674). A server
// in another language or toolchain (the platform API today) pins its own lists against this file instead of
// parsing TypeScript source. The source of truth stays the `as const` lists in src/; this file is generated.
//
//   node scripts/vocab.mjs           regenerate vocab.json
//   node scripts/vocab.mjs --check   fail when vocab.json differs from src/ (run by `pnpm test`)
//
// Node 26 strips types natively; the imported files hold only type-only imports, so no loader is needed.
import { readFileSync, writeFileSync } from 'node:fs';

const target = new URL('../src/vocab.json', import.meta.url);
const { KERNEL_PERMISSIONS } = await import('../src/menu/menu.ts');
const { AUDIT_ACTIONS } = await import('../src/adapter/audit.ts');
const { USAGE_VIAS } = await import('../src/adapter/adapter.ts');
const { OUTCOMES } = await import('../src/adapter/response.ts');

const vocab = {
  kernelPermissions: KERNEL_PERMISSIONS,
  usageVias: USAGE_VIAS,
  auditActions: AUDIT_ACTIONS,
  outcomes: OUTCOMES,
};
const text = `${JSON.stringify(vocab, null, 2)}\n`;

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(target, 'utf8');
  } catch {
    // Missing file reports as out of date below.
  }
  if (current !== text) {
    process.stderr.write('vocab.json is out of date with src/ — run `pnpm --filter @ap/contracts gen:vocab` and commit it\n');
    process.exitCode = 1;
  } else {
    process.stdout.write('vocab.json is up to date\n');
  }
} else {
  writeFileSync(target, text);
  process.stdout.write('wrote vocab.json\n');
}
