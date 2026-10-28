// Packs the contract schema artifacts into one release asset (ADR-0096, #1086): JSON Schema 2020-12 files for the wire contracts,
// the menu endpoint declarations, and the closed vocabularies a server outside this workspace follows.
// Usage: pnpm sdk:schemas --version X.Y.Z --out <dir>   (--version defaults to 0.0.0-ci)
//
// Writes contract-schemas-X.Y.Z.tgz and SHA256SUMS-schemas into --out, which must be absent or an empty directory (nothing in it
// is ever deleted). Everything is staged in a temp directory outside the repo and moved only after the archive checked out.
// It copies committed files (`schemas/*.json`, `endpoints.json`, `@ap/contracts` `vocab.json`); their freshness is the job of
// `pnpm --filter @ap/contract-schemas test` (schemas) and `pnpm sdk:test` (endpoints.json), not of this script. The archive is
// not byte-reproducible (tar stores mtimes); verify it by SHA256SUMS-schemas.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const packageRoot = join(repoRoot, 'packages', 'sdk', 'contract-schemas');
const contractsVocab = join(repoRoot, 'packages', 'sdk', 'contracts', 'src', 'vocab.json');

function fail(message) {
  throw new Error(message);
}

function oneLine(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function parseArgs(argv) {
  const options = { version: '0.0.0-ci', out: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--version' || flag === '--out') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) fail(`${flag} needs a value`);
      options[flag.slice(2)] = value;
      i += 1;
    } else {
      fail(`unknown argument ${flag} (usage: sdk-schemas --version X.Y.Z --out <dir>)`);
    }
  }
  if (!options.out) fail('--out <dir> is required');
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(options.version)) fail(`--version ${options.version} is not a SemVer`);
  return options;
}

/** `--out` is never cleaned: it must be absent or an empty directory, so a failed run cannot destroy an earlier release. */
function assertOutDirFree(outDir) {
  if (!existsSync(outDir)) return;
  if (!statSync(outDir).isDirectory()) fail(`--out ${outDir} exists and is not a directory`);
  if (readdirSync(outDir).length > 0) fail(`--out ${outDir} is not empty; pass a new or empty directory (nothing is deleted)`);
}

export function readme(version) {
  return `# contract-schemas ${version}

Platform wire contracts for a server outside this workspace (ADR-0096). Generated; do not edit.

- \`schemas/*.json\` — JSON Schema 2020-12: Outcome, AssessmentKind, Assessment, Trust, ApiResponse (\`data\` is any value or null),
  MenuQueryContext, MenuQuery, EndpointDeclaration.
- \`endpoints.json\` — every menu endpoint declaration (\`paramKeys\` is the list of allowed params keys), sorted by \`id\`.
- \`vocab.json\` — the closed vocabularies (kernel permissions, usage vias, audit actions, outcomes).

Format rules: https://github.com/hjung3113/analytics-platform/blob/main/packages/sdk/contract-schemas/AGENTS.md#artifact-format-rules
Verify the archive with \`SHA256SUMS-schemas\`.
`;
}

/** The archive members, relative to its root, in listing order. */
export function archiveFiles() {
  const schemas = readdirSync(join(packageRoot, 'schemas')).filter((file) => file.endsWith('.json')).sort();
  if (schemas.length === 0) fail('packages/sdk/contract-schemas/schemas has no schema files');
  return [...schemas.map((file) => `schemas/${file}`), 'endpoints.json', 'vocab.json', 'README.md'];
}

function main() {
  const { version, out } = parseArgs(process.argv.slice(2));
  const outDir = resolve(out);
  const staging = mkdtempSync(join(tmpdir(), 'ap-sdk-schemas-'));
  try {
    const relativeStaging = relative(repoRoot, staging);
    if (relativeStaging === '' || !relativeStaging.startsWith(`..${sep}`)) fail('staging directory must be outside the repository');
    assertOutDirFree(outDir);

    const tree = join(staging, 'tree');
    mkdirSync(join(tree, 'schemas'), { recursive: true });
    const files = archiveFiles();
    for (const file of files) {
      const destination = join(tree, file);
      if (file === 'README.md') writeFileSync(destination, readme(version));
      else if (file === 'vocab.json') cpSync(contractsVocab, destination);
      else cpSync(join(packageRoot, file), destination);
    }

    const collected = join(staging, 'out');
    mkdirSync(collected);
    const archive = `contract-schemas-${version}.tgz`;
    // COPYFILE_DISABLE keeps macOS tar from adding AppleDouble `._*` members.
    const packed = spawnSync('tar', ['-czf', join(collected, archive), '-C', tree, ...files], { encoding: 'utf8', env: { ...process.env, COPYFILE_DISABLE: '1' } });
    if (packed.error || packed.status !== 0) fail(`tar failed: ${oneLine(packed.error?.message ?? packed.stderr ?? '')}`);

    const listed = spawnSync('tar', ['-tzf', join(collected, archive)], { encoding: 'utf8' });
    const members = (listed.stdout ?? '').split(/\r?\n/).filter(Boolean);
    if (listed.status !== 0 || members.join('\n') !== files.join('\n')) fail(`archive lists ${members.join(', ')}, expected ${files.join(', ')}`);

    const sum = createHash('sha256').update(readFileSync(join(collected, archive))).digest('hex');
    writeFileSync(join(collected, 'SHA256SUMS-schemas'), `${sum}  ${archive}\n`);
    assertOutDirFree(outDir);
    mkdirSync(outDir, { recursive: true });
    for (const file of readdirSync(collected)) cpSync(join(collected, file), join(outDir, file));
    process.stdout.write(`sdk:schemas passed: ${archive} (${files.length} files) + SHA256SUMS-schemas in ${outDir}\n`);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`sdk:schemas FAILED: ${oneLine(error instanceof Error ? error.message : String(error))}\n`);
    process.exitCode = 1;
  }
}
