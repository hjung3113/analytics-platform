#!/usr/bin/env node
// #3204: writes a synthetic analysis workload (`@ap/server-conformance/datasets`) as files for an opt-in engine run
// (#1704 loaders, #2918 measurements). Never run by CI. Memory stays at one batch whatever the size.
//
//   pnpm --filter @ap/server-conformance build   # the script runs the built package
//   node tooling/scripts/synthetic-workload.mjs --dataset interval-steps|shared-resource --out <dir outside the repo>
//        [--seed <text>] [--profile functional|large] [--params '<JSON>'] [--format ndjson|csv] [--batch <parents>]
//
// Writes <table>.ndjson|csv per table and manifest.json: dataset, version, seed, full parameters, row counts,
// checksum, and the run's measurement (elapsed ms, rows per second, peak RSS, Node, platform, CPU). The checksum
// equals `generateSyntheticDataset` for the same inputs. `--params` goes over the profile; in-house sizes are passed
// this way and stay in-house (docs/integration/upstream-feedback-procedure.md §3).
// Exit status: 0 = written, 1 = generation or write failed, 2 = usage (including a parameter outside its domain; nothing is written).
import { closeSync, existsSync, mkdirSync, openSync, realpathSync, writeFileSync, writeSync } from 'node:fs';
import { arch, cpus, platform } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const DIST = new URL('../../packages/host/server-conformance/dist/datasets/index.js', import.meta.url);

/** The real path of `path`, resolving symlinks through its nearest existing ancestor (the folder may not exist yet). */
function realPath(path) {
  if (existsSync(path)) return realpathSync(path);
  const parent = dirname(path);
  return parent === path ? path : join(realPath(parent), basename(path));
}

/** True when `path` is the repository or inside it (`../x` and `/x` are outside; a `..name` folder is inside). */
function insideRepository(path) {
  const inside = relative(realpathSync(root), realPath(path));
  return inside === '' || (inside !== '..' && !inside.startsWith(`..${sep}`) && !isAbsolute(inside));
}

function parse(argv) {
  const options = { seed: 'workload', profile: 'functional', params: '{}', format: 'ndjson', batch: '10000' };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '');
    if (!argv[i]?.startsWith('--') || !['dataset', 'out', 'seed', 'profile', 'params', 'format', 'batch'].includes(key) || argv[i + 1] === undefined) return null;
    options[key] = argv[i + 1];
  }
  return options.dataset && options.out ? options : null;
}

async function main(argv) {
  const options = parse(argv);
  if (!options) {
    console.error('usage: synthetic-workload.mjs --dataset <name> --out <dir> [--seed s] [--profile functional|large] [--params JSON] [--format ndjson|csv] [--batch n]');
    return 2;
  }
  const out = resolve(options.out);
  if (insideRepository(out)) {
    console.error(`synthetic-workload: --out ${out} is inside the repository; write workloads outside it so no large file gets committed`);
    return 2;
  }
  if (!existsSync(DIST)) {
    console.error('synthetic-workload: build the package first: pnpm --filter @ap/server-conformance build');
    return 2;
  }
  const { streamSyntheticDataset, SYNTHETIC_TABLES, SYNTHETIC_WORKLOAD_PROFILES, writeSyntheticWorkload } = await import(DIST.href);
  const profile = SYNTHETIC_WORKLOAD_PROFILES[options.profile]?.[options.dataset];
  if (!profile || !['ndjson', 'csv'].includes(options.format)) {
    console.error(`synthetic-workload: unknown dataset, profile or format (${options.dataset}, ${options.profile}, ${options.format})`);
    return 2;
  }
  // Parameters, batch size and their domains are checked before anything touches the disk (the stream is lazy).
  let params;
  try {
    params = { ...profile, ...JSON.parse(options.params) };
    streamSyntheticDataset(options.dataset, options.seed, params, { batchParents: Number(options.batch) });
  } catch (error) {
    console.error(`synthetic-workload: ${error.message}`);
    return 2;
  }
  const files = new Map();
  const started = performance.now();
  try {
    mkdirSync(out, { recursive: true });
    for (const table of SYNTHETIC_TABLES[options.dataset]) files.set(table, openSync(join(out, `${table}.${options.format}`), 'w'));
    const manifest = writeSyntheticWorkload(options.dataset, options.seed, params, options.format, { write: (table, text) => writeSync(files.get(table), text) }, { batchParents: Number(options.batch) });
    const elapsedMs = Math.round(performance.now() - started);
    const total = Object.values(manifest.rows).reduce((a, b) => a + b, 0);
    const measurement = {
      elapsedMs, rowsPerSecond: Math.round(total / Math.max(elapsedMs / 1000, 0.001)), peakRssMb: Math.round(process.resourceUsage().maxRSS / 1024),
      batchParents: Number(options.batch), node: process.version, platform: `${platform()}-${arch()}`, cpu: `${cpus()[0]?.model ?? 'unknown'} ×${cpus().length}`,
    };
    writeFileSync(join(out, 'manifest.json'), `${JSON.stringify({ ...manifest, profile: options.profile, measurement }, null, 2)}\n`);
    console.log(`synthetic-workload: ${total} rows (${Object.entries(manifest.rows).map(([t, n]) => `${t} ${n}`).join(', ')}) in ${elapsedMs} ms, checksum ${manifest.checksum} → ${out}`);
    return 0;
  } catch (error) {
    console.error(`synthetic-workload: ${error.message}`);
    return 1;
  } finally {
    for (const fd of files.values()) closeSync(fd);
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) process.exit(await main(process.argv.slice(2)));
