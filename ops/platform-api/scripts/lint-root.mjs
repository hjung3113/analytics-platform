// Bounded root leaf: boundaries and committed changed-file Biome (ops and documentation roots; the ESLint packages lint themselves).
// Uncached in turbo.json: comparison history/ref is external to the package hash.
import { spawnSync } from 'node:child_process';
import { OPS_ROOT } from '../paths.mjs';
for (const args of [
  ['scripts/check-boundaries.mjs'],
  ['scripts/gates/fe-biome-gate.mjs', '--base', process.env.FEATURE_LINT_BASE || 'origin/main'],
]) {
  const run = spawnSync(process.execPath, args, { cwd: OPS_ROOT, stdio: 'inherit' });
  if (run.status !== 0) process.exit(run.status ?? 1);
}
