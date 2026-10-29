#!/usr/bin/env node
// Runs Biome over the FeedbackOps paths named in ../paths.mjs (the tool package and the documentation roots).
// platform-api, feature-shared, feature-ui and feature-screens are ESLint packages (#1102): the Biome scope excludes them.
// Usage: node scripts/lint-tools.mjs <biome-check|biome-format>
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import { FO_BIOME_SCOPE, FO_OPS, OPS_ROOT, foPath } from '../paths.mjs';

const bin = (name) => join(OPS_ROOT, 'node_modules', '.bin', name);
const scope = FO_BIOME_SCOPE.filter((dir) => dir !== FO_OPS).map((dir) => foPath(dir));
const commands = {
  // Biome runs from this package, where biome.json lives; the tool package itself is `.`.
  'biome-check': { cwd: OPS_ROOT, command: bin('biome'), args: ['check', '.', ...scope] },
  'biome-format': {
    cwd: OPS_ROOT,
    command: bin('biome'),
    args: ['format', '--write', '.', ...scope],
  },
};

const entry = commands[process.argv[2]];
if (!entry) {
  console.error(`usage: lint-tools.mjs ${Object.keys(commands).join('|')}`);
  process.exit(2);
}
const run = spawnSync(entry.command, entry.args, { cwd: entry.cwd, stdio: 'inherit' });
if (run.error) {
  console.error(`lint-tools: could not run ${entry.command}: ${run.error.message}`);
  process.exit(2);
}
process.exit(run.status ?? 1);
