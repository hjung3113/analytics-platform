#!/usr/bin/env node
// Type checking runs on TypeScript 7 (#3029): about 5x faster than 5.9 on this repo. The `typescript` package stays 5.9 for
// everything that loads its JS API (typescript-eslint, sdk:api, gen-menu, Storybook docgen, check-boundaries); TS 7 has none.
// TS 7 is installed here under the alias `typescript7`, so it never replaces another package's `tsc` bin. `AP_TSC=5` runs the
// calling package's own TypeScript 5.9 instead (weekly full CI run), to catch a difference between the two checkers.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const fromPackage = createRequire(join(process.cwd(), 'package.json'));
const fromHere = createRequire(import.meta.url);
const manifest = process.env.AP_TSC === '5' ? fromPackage.resolve('typescript/package.json') : fromHere.resolve('typescript7/package.json');
const result = spawnSync(process.execPath, [join(dirname(manifest), 'bin', 'tsc'), ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(result.status ?? 1);
