#!/usr/bin/env node
// Runs Biome and the design-system lint (Oxlint) over the FeedbackOps paths named in ../paths.mjs.
// Usage: node scripts/lint-tools.mjs <biome-check|biome-format|lint-design>
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  FO_BIOME_SCOPE,
  FO_FRONTEND,
  FO_OPS,
  FO_UI,
  OPS_ROOT,
  REPO_ROOT,
  foPath,
} from '../paths.mjs';

// ignorePatterns in .oxlintrc.json match relative to the config's folder, which no longer contains the sources, so the
// same patterns are passed on the command line (relative to the repository root, where Oxlint runs).
const oxlintIgnores = JSON.parse(
  readFileSync(join(OPS_ROOT, '.oxlintrc.json'), 'utf8'),
).ignorePatterns.flatMap((pattern) => ['--ignore-pattern', pattern]);
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
  // Oxlint rejects ".." in paths, so it runs from the repository root with repository-relative config and targets.
  'lint-design': {
    cwd: REPO_ROOT,
    command: bin('oxlint'),
    args: [
      '-c',
      join(FO_OPS, '.oxlintrc.json'),
      ...oxlintIgnores,
      '--max-warnings',
      '0',
      join(FO_FRONTEND, 'src'),
      join(FO_UI, 'src'),
    ],
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
